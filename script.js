class Ant {
  constructor(x = 0, y = 0, direction = 0, color = "#ff0000") {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.color = color;
    this.steps = 0;
    this.id = Math.random().toString(36).substr(2, 9);
    this.isCarryingCheese = false;
  }
}

class Cheese {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.senseRadius = 10; // How far ants can smell the cheese
    this.id = Math.random().toString(36).substr(2, 9);
    this.isBeingCarried = false;
  }
}

class Colony {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.senseRadius = 15; // Larger radius than cheese for returning home
    this.id = Math.random().toString(36).substr(2, 9);
    this.cheeseCollected = 0;
  }
}

class LangtonAnt {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Create a separate canvas for radius visualization
    this.radiusCanvas = document.createElement("canvas");
    this.radiusCanvas.id = "radiusCanvas";
    this.radiusCanvas.style.position = "absolute";
    this.radiusCanvas.style.left = "0";
    this.radiusCanvas.style.top = "0";
    this.radiusCanvas.style.pointerEvents = "none"; // Allow clicks to pass through
    this.radiusCanvas.style.transition = "opacity 0.3s ease";
    this.radiusCtx = this.radiusCanvas.getContext("2d");

    // Insert radius canvas right after the main canvas
    this.canvas.parentNode.insertBefore(
      this.radiusCanvas,
      this.canvas.nextSibling
    );

    // Set up the viewport and world coordinates
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    this.canvas.width = this.viewportWidth;
    this.canvas.height = this.viewportHeight;
    this.radiusCanvas.width = this.viewportWidth;
    this.radiusCanvas.height = this.viewportHeight;

    // Initialize cell and ant properties
    this.baseSize = 20; // Increased base size for better visibility
    this.cellSize = this.baseSize;
    this.zoomLevel = 1;
    this.minZoom = 0.1;
    this.maxZoom = 5;
    this.grid = new Map();
    this.ants = [new Ant()];
    this.stepCount = 0;

    // Initialize world offset to center
    this.worldOffset = {
      x: this.viewportWidth / 2,
      y: this.viewportHeight / 2,
    };

    // Color rules
    const isDarkMode =
      document.documentElement.getAttribute("data-theme") === "dark";
    this.evenColor = isDarkMode ? "#ffffff" : "#000000";
    this.oddColor = isDarkMode ? "#ffffff" : "#000000";

    // Animation and interaction properties
    this.isRunning = false;
    this.speed = 50;
    this.animationId = null;
    this.lastFrameTime = 0;
    this.stepAccumulator = 0;
    this.targetFrameTime = 1000 / 60; // Target 60 FPS
    this.maxStepsPerFrame = 10000; // Increased from 1000 to handle higher speeds
    this.hudUpdateInterval = 10; // Update HUD every N steps

    // Performance optimization
    this.directionVectors = [
      { x: 0, y: -1 }, // Up
      { x: 1, y: 0 }, // Right
      { x: 0, y: 1 }, // Down
      { x: -1, y: 0 }, // Left
    ];

    // Batch rendering
    this.dirtyRegion = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    this.needsFullRedraw = true;

    // Create a temporary canvas for SVG coloring
    this.tempCanvas = document.createElement("canvas");
    this.tempCtx = this.tempCanvas.getContext("2d");

    // Load ant SVG
    this.antImage = new Image();
    this.antImage.src = "ant.svg";
    this.antImage.onload = () => {
      // Set temp canvas size to match ant image
      this.tempCanvas.width = this.antImage.width;
      this.tempCanvas.height = this.antImage.height;
      this.centerView();
      this.draw();
    };

    // Ant placement mode
    this.isPlacementMode = false;
    this.placementPreviewPos = null;

    // Add cheese management
    this.cheeses = [];
    this.isCheeseMode = false;

    // Add colony management
    this.colony = null;
    this.isColonyMode = false;
    this.showSenseRadius = false; // Default to hidden

    this.setupHandlers();
    this.setupHUD();
  }

  setupHandlers() {
    // Mouse drag handling
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.isColonyMode) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(mouseX, mouseY);

        this.colony = new Colony(worldPos.x, worldPos.y);
        this.draw();

        // Exit colony mode
        this.isColonyMode = false;
        this.placementPreviewPos = null;
        this.canvas.style.cursor = "grab";
        return;
      }

      if (this.isCheeseMode) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(mouseX, mouseY);

        const newCheese = new Cheese(worldPos.x, worldPos.y);
        this.cheeses.push(newCheese);
        this.draw();

        // Exit cheese mode
        this.isCheeseMode = false;
        this.placementPreviewPos = null;
        this.canvas.style.cursor = "grab";
        return;
      }

      if (this.isPlacementMode) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(mouseX, mouseY);

        // Generate a vibrant color for better visibility
        const hue = Math.random() * 360;
        const randomColor = `hsl(${hue}, 70%, 50%)`;

        const newAnt = new Ant(
          worldPos.x,
          worldPos.y,
          Math.floor(Math.random() * 4),
          randomColor
        );
        this.ants.push(newAnt);
        this.updateAntsList();
        this.draw();

        // Exit placement mode
        this.isPlacementMode = false;
        this.placementPreviewPos = null;
        this.canvas.style.cursor = "grab";
        return;
      }

      this.isDragging = true;
      this.lastMousePos = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = "grabbing";
    });

    // Add touch event handlers for mobile
    let lastTouchDistance = 0;
    let lastTouchCenter = { x: 0, y: 0 };

    this.canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        // Store initial pinch distance and center
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        lastTouchDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        lastTouchCenter = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2,
        };
      } else if (e.touches.length === 1) {
        // Single touch for panning
        const rect = this.canvas.getBoundingClientRect();
        this.isDragging = true;
        this.lastMousePos = {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      e.preventDefault();
    });

    this.canvas.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2) {
        // Handle pinch zoom
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const touchDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        const touchCenter = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2,
        };

        // Calculate zoom factor
        const zoomFactor = touchDistance / lastTouchDistance;
        const newZoomLevel = Math.min(
          this.maxZoom,
          Math.max(this.minZoom, this.zoomLevel * zoomFactor)
        );

        if (newZoomLevel !== this.zoomLevel) {
          // Convert touch center to world coordinates before zoom
          const worldX = (touchCenter.x - this.worldOffset.x) / this.cellSize;
          const worldY = (touchCenter.y - this.worldOffset.y) / this.cellSize;

          // Update zoom level
          this.zoomLevel = newZoomLevel;
          this.cellSize = this.baseSize * this.zoomLevel;

          // Adjust offset to keep touch center fixed
          this.worldOffset.x = touchCenter.x - worldX * this.cellSize;
          this.worldOffset.y = touchCenter.y - worldY * this.cellSize;

          this.draw();
        }

        lastTouchDistance = touchDistance;
        lastTouchCenter = touchCenter;
      } else if (e.touches.length === 1 && this.isDragging) {
        // Handle single touch pan with improved precision
        const rect = this.canvas.getBoundingClientRect();
        const currentX = e.touches[0].clientX - rect.left;
        const currentY = e.touches[0].clientY - rect.top;

        const dx = currentX - this.lastMousePos.x;
        const dy = currentY - this.lastMousePos.y;

        // Apply the movement with inertia dampening for smoother motion
        this.worldOffset.x += dx * 1.0; // Adjust multiplier if needed
        this.worldOffset.y += dy * 1.0;

        this.lastMousePos = { x: currentX, y: currentY };

        // Request animation frame for smoother updates
        requestAnimationFrame(() => this.draw());
      }
      e.preventDefault();
    });

    this.canvas.addEventListener("touchend", (e) => {
      this.isDragging = false;
      lastTouchDistance = 0;
      // If no touches left, ensure we stop any ongoing interactions
      if (e.touches.length === 0) {
        this.isDragging = false;
        lastTouchDistance = 0;
      }
      e.preventDefault();
    });

    // Add touchcancel handler for better cleanup
    this.canvas.addEventListener("touchcancel", () => {
      this.isDragging = false;
      lastTouchDistance = 0;
    });

    document.addEventListener("mousemove", (e) => {
      if (this.isColonyMode || this.isCheeseMode || this.isPlacementMode) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        this.placementPreviewPos = { x: mouseX, y: mouseY };
        this.draw();
        return;
      }

      if (!this.isDragging) return;

      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;

      this.worldOffset.x += dx;
      this.worldOffset.y += dy;

      this.lastMousePos = { x: e.clientX, y: e.clientY };
      this.draw();
    });

    document.addEventListener("mouseup", () => {
      this.isDragging = false;
      this.canvas.style.cursor = "grab";
    });

    // Zoom handling
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();

      const mouseX = e.clientX - this.canvas.offsetLeft;
      const mouseY = e.clientY - this.canvas.offsetTop;

      // Convert mouse position to world coordinates before zoom
      const worldX = (mouseX - this.worldOffset.x) / this.cellSize;
      const worldY = (mouseY - this.worldOffset.y) / this.cellSize;

      // Update zoom level
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoomLevel = Math.min(
        this.maxZoom,
        Math.max(this.minZoom, this.zoomLevel * zoomFactor)
      );
      this.cellSize = this.baseSize * this.zoomLevel;

      // Adjust offset to keep mouse position fixed relative to world
      this.worldOffset.x = mouseX - worldX * this.cellSize;
      this.worldOffset.y = mouseY - worldY * this.cellSize;

      this.draw();
    });

    // Prevent text selection while dragging
    this.canvas.addEventListener("selectstart", (e) => e.preventDefault());

    // Add escape key handler to cancel placement
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.cancelPlacement();
      }
    });
  }

  setupHUD() {
    // Update speed value display
    const speedSlider = document.getElementById("speed");
    const speedValue = document.getElementById("speedValue");
    speedSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      // Apply exponential scaling for better control at high speeds
      this.speed = Math.pow(value, 1.5) / 10;
      speedValue.textContent = `${Math.round(this.speed)}x`;
    });

    // Helper function to invert a hex color
    const invertColor = (hex) => {
      // Remove # if present
      hex = hex.replace("#", "");
      // Convert to RGB
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      // Invert each component
      const invR = (255 - r).toString(16).padStart(2, "0");
      const invG = (255 - g).toString(16).padStart(2, "0");
      const invB = (255 - b).toString(16).padStart(2, "0");
      // Return as hex
      return `#${invR}${invG}${invB}`;
    };

    // Theme toggle with color inversion
    const themeToggle = document.getElementById("themeToggle");
    const evenColorInput = document.getElementById("evenColor");
    const oddColorInput = document.getElementById("oddColor");

    themeToggle.addEventListener("click", () => {
      const html = document.documentElement;
      const currentTheme = html.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", newTheme);

      // Invert colors and update inputs
      this.evenColor = invertColor(this.evenColor);
      this.oddColor = invertColor(this.oddColor);
      evenColorInput.value = this.evenColor;
      oddColorInput.value = this.oddColor;

      this.needsFullRedraw = true;
      this.draw();
    });

    // Color rule handlers
    evenColorInput.addEventListener("input", (e) => {
      this.evenColor = e.target.value;
      this.draw();
    });

    oddColorInput.addEventListener("input", (e) => {
      this.oddColor = e.target.value;
      this.draw();
    });

    // Modify add ant button handler
    document.getElementById("addAnt").addEventListener("click", () => {
      this.isPlacementMode = true;
      this.canvas.style.cursor = "crosshair";
    });

    // Add cheese button
    const controlHeader = document.querySelector(".control-header");
    const cheeseBtn = document.createElement("button");
    cheeseBtn.className = "icon-button";
    cheeseBtn.innerHTML = "🧀";
    cheeseBtn.title = "Place cheese";
    cheeseBtn.onclick = () => {
      this.isCheeseMode = true;
      this.canvas.style.cursor = "crosshair";
    };
    controlHeader.appendChild(cheeseBtn);

    // Add colony button next to cheese button
    const colonyBtn = document.createElement("button");
    colonyBtn.className = "icon-button";
    colonyBtn.innerHTML = "🏠";
    colonyBtn.title = "Place colony (only one allowed)";
    colonyBtn.onclick = () => {
      if (this.colony) {
        alert("Only one colony is allowed!");
        return;
      }
      this.isColonyMode = true;
      this.canvas.style.cursor = "crosshair";
    };
    controlHeader.appendChild(colonyBtn);

    // Modify radius visibility toggle button
    const radiusToggleBtn = document.createElement("button");
    radiusToggleBtn.className = "icon-button";
    radiusToggleBtn.innerHTML = "👁️";
    radiusToggleBtn.title = "Toggle sense radius visibility";
    radiusToggleBtn.onclick = () => {
      this.showSenseRadius = !this.showSenseRadius;
      radiusToggleBtn.style.opacity = this.showSenseRadius ? "1" : "0.5";
      this.radiusCanvas.style.opacity = this.showSenseRadius ? "1" : "0";
      this.draw();
    };
    radiusToggleBtn.style.opacity = "0.5"; // Start with toggle off
    this.radiusCanvas.style.opacity = "0"; // Start with radius hidden
    controlHeader.appendChild(radiusToggleBtn);

    // Add colony stats to HUD
    const statsDiv = document.querySelector(".stats");
    const colonyStats = document.createElement("div");
    colonyStats.id = "colonyStats";
    colonyStats.textContent = "Colony Cheese: 0";
    statsDiv.appendChild(colonyStats);

    this.updateAntsList();
  }

  updateAntsList() {
    const antsList = document.getElementById("antsList");
    antsList.innerHTML = "";

    this.ants.forEach((ant, index) => {
      const antEntry = document.createElement("div");
      antEntry.className = "ant-entry";

      const colorBox = document.createElement("div");
      colorBox.className = "ant-color";
      colorBox.style.backgroundColor = ant.color;

      const antInfo = document.createElement("span");
      antInfo.textContent = `Ant ${index + 1} - Steps: ${ant.steps}${
        ant.isCarryingCheese ? " 🧀" : ""
      }`;

      const controls = document.createElement("div");
      controls.className = "ant-controls";

      if (index > 0) {
        // Don't allow removing the first ant
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×";
        removeBtn.title = "Remove ant";
        removeBtn.onclick = () => {
          this.ants = this.ants.filter((a) => a.id !== ant.id);
          this.updateAntsList();
          this.draw();
        };
        controls.appendChild(removeBtn);
      }

      antEntry.appendChild(colorBox);
      antEntry.appendChild(antInfo);
      antEntry.appendChild(controls);
      antsList.appendChild(antEntry);
    });
  }

  updateHUD() {
    document.getElementById("stepCount").textContent =
      this.stepCount.toLocaleString();
    this.updateAntsList();
  }

  centerView() {
    // Center the view on (0,0)
    this.worldOffset = {
      x: this.viewportWidth / 2,
      y: this.viewportHeight / 2,
    };

    // Force a full redraw
    this.needsFullRedraw = true;
    this.draw();
  }

  worldToScreen(worldX, worldY) {
    return {
      x: worldX * this.cellSize + this.worldOffset.x,
      y: worldY * this.cellSize + this.worldOffset.y,
    };
  }

  screenToWorld(screenX, screenY) {
    return {
      x: Math.floor((screenX - this.worldOffset.x) / this.cellSize),
      y: Math.floor((screenY - this.worldOffset.y) / this.cellSize),
    };
  }

  drawGrid() {
    const { x: startX, y: startY } = this.screenToWorld(0, 0);
    const { x: endX, y: endY } = this.screenToWorld(
      this.viewportWidth,
      this.viewportHeight
    );

    this.ctx.strokeStyle = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--grid-color");
    this.ctx.lineWidth = 0.5;

    // Draw vertical lines
    for (let x = startX - 1; x <= endX + 1; x++) {
      const screenX = this.worldToScreen(x, 0).x;
      this.ctx.beginPath();
      this.ctx.moveTo(screenX, 0);
      this.ctx.lineTo(screenX, this.viewportHeight);
      this.ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = startY - 1; y <= endY + 1; y++) {
      const screenY = this.worldToScreen(0, y).y;
      this.ctx.beginPath();
      this.ctx.moveTo(0, screenY);
      this.ctx.lineTo(this.viewportWidth, screenY);
      this.ctx.stroke();
    }
  }

  drawCell(worldX, worldY, stepNumber) {
    const screen = this.worldToScreen(worldX, worldY);
    this.ctx.fillStyle = stepNumber % 2 === 0 ? this.evenColor : this.oddColor;
    this.ctx.fillRect(screen.x, screen.y, this.cellSize, this.cellSize);
  }

  // Helper to create colored version of ant SVG
  createColoredAntImage(color) {
    // Clear temp canvas
    this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);

    // Draw the original ant
    this.tempCtx.drawImage(this.antImage, 0, 0);

    // Apply color
    this.tempCtx.globalCompositeOperation = "source-in";
    this.tempCtx.fillStyle = color;
    this.tempCtx.fillRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);

    // Reset composite operation
    this.tempCtx.globalCompositeOperation = "source-over";

    return this.tempCanvas;
  }

  drawAnt(ant) {
    const screen = this.worldToScreen(ant.x, ant.y);

    this.ctx.save();
    this.ctx.translate(
      screen.x + this.cellSize / 2,
      screen.y + this.cellSize / 2
    );

    // Rotate based on direction
    const rotationAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    this.ctx.rotate(rotationAngles[ant.direction]);

    // Draw the ant image with custom color
    const antSize = this.cellSize * 1.2;

    // Create and draw colored version of the ant
    if (this.antImage.complete) {
      const coloredAnt = this.createColoredAntImage(ant.color);
      this.ctx.drawImage(
        coloredAnt,
        -antSize / 2,
        -antSize / 2,
        antSize,
        antSize
      );

      // Draw cheese indicator if carrying
      if (ant.isCarryingCheese) {
        // Draw a small cheese circle above the ant
        this.ctx.rotate(-rotationAngles[ant.direction]); // Reset rotation for the cheese
        this.ctx.fillStyle = "#ffd700";
        this.ctx.beginPath();
        this.ctx.arc(0, -antSize / 2 - 5, antSize / 4, 0, Math.PI * 2);
        this.ctx.fill();

        // Add some holes to make it look like cheese
        this.ctx.fillStyle = "#ffaa00";
        const holePositions = [
          { x: -3, y: -antSize / 2 - 6 },
          { x: 3, y: -antSize / 2 - 4 },
          { x: 0, y: -antSize / 2 - 3 },
        ];
        holePositions.forEach((pos) => {
          this.ctx.beginPath();
          this.ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
          this.ctx.fill();
        });
      }
    }

    this.ctx.restore();
  }

  drawCheese(cheese, isPreview = false, drawRadius = true) {
    const screen = this.worldToScreen(cheese.x, cheese.y);
    const size = this.cellSize * 1.5;

    this.ctx.save();

    if (isPreview) {
      this.ctx.globalAlpha = 0.5;
    }

    // Draw cheese
    this.ctx.fillStyle = "#ffd700";
    this.ctx.beginPath();
    this.ctx.arc(
      screen.x + this.cellSize / 2,
      screen.y + this.cellSize / 2,
      size / 2,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Draw preview radius if needed
    if (isPreview && !cheese.isBeingCarried) {
      this.drawCheeseRadius(cheese);
    }

    this.ctx.restore();
  }

  drawColony(colony, isPreview = false, drawRadius = true) {
    const screen = this.worldToScreen(colony.x, colony.y);
    const size = this.cellSize * 2;

    this.ctx.save();

    if (isPreview) {
      this.ctx.globalAlpha = 0.5;
    }

    // Draw colony base
    this.ctx.fillStyle = "#8b4513";
    this.ctx.beginPath();
    this.ctx.moveTo(screen.x + this.cellSize / 2, screen.y);
    this.ctx.lineTo(screen.x + this.cellSize * 1.5, screen.y + this.cellSize);
    this.ctx.lineTo(screen.x - this.cellSize / 2, screen.y + this.cellSize);
    this.ctx.closePath();
    this.ctx.fill();

    // Draw colony entrance
    this.ctx.fillStyle = "#4a2508";
    this.ctx.beginPath();
    this.ctx.ellipse(
      screen.x + this.cellSize / 2,
      screen.y + this.cellSize * 0.8,
      this.cellSize / 3,
      this.cellSize / 4,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Draw preview radius if needed
    if (isPreview) {
      this.drawColonyRadius(colony);
    }

    // Draw cheese count if not preview
    if (!isPreview && colony.cheeseCollected > 0) {
      this.ctx.fillStyle = "#ffd700";
      this.ctx.font = `${this.cellSize / 2}px Arial`;
      this.ctx.textAlign = "center";
      this.ctx.fillText(
        `🧀 ${colony.cheeseCollected}`,
        screen.x + this.cellSize / 2,
        screen.y - this.cellSize / 4
      );
    }

    this.ctx.restore();
  }

  draw(forceFullRedraw = true) {
    // Always clear both canvases completely
    this.ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
    this.radiusCtx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);

    // Fill background
    this.ctx.fillStyle = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--bg-color");
    this.ctx.fillRect(0, 0, this.viewportWidth, this.viewportHeight);

    // Draw grid
    this.drawGrid();

    // Draw all visible cells
    const { x: startX, y: startY } = this.screenToWorld(0, 0);
    const { x: endX, y: endY } = this.screenToWorld(
      this.viewportWidth,
      this.viewportHeight
    );

    // Draw colored cells
    for (let x = startX - 1; x <= endX + 1; x++) {
      for (let y = startY - 1; y <= endY + 1; y++) {
        if (this.isCellBlack(x, y)) {
          this.drawCell(x, y, this.getCellStepNumber(x, y));
        }
      }
    }

    // Draw radii on separate canvas
    this.drawRadii();

    // Draw other elements on main canvas
    if (this.colony) {
      this.drawColony(this.colony, false, false);
    }

    // Draw cheeses
    this.cheeses.forEach((cheese) => this.drawCheese(cheese, false, false));

    // Draw ants
    this.ants.forEach((ant) => this.drawAnt(ant));

    // Draw placement preview
    if (
      (this.isPlacementMode || this.isCheeseMode || this.isColonyMode) &&
      this.placementPreviewPos
    ) {
      this.drawPlacementPreview();
    }
  }

  drawRadii() {
    // Clear the radius canvas
    this.radiusCtx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);

    // Draw colony radius
    if (this.colony) {
      this.drawColonyRadius(this.colony);
    }

    // Draw cheese radii
    this.cheeses.forEach((cheese) => {
      if (!cheese.isBeingCarried) {
        this.drawCheeseRadius(cheese);
      }
    });
  }

  drawCheeseRadius(cheese) {
    const radiusInCells = Math.ceil(cheese.senseRadius);
    for (let dy = -radiusInCells; dy <= radiusInCells; dy++) {
      for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= cheese.senseRadius) {
          const cellScreen = this.worldToScreen(cheese.x + dx, cheese.y + dy);
          const alpha = Math.max(0, 1 - distance / cheese.senseRadius) * 0.15;
          this.radiusCtx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
          this.radiusCtx.fillRect(
            cellScreen.x,
            cellScreen.y,
            this.cellSize,
            this.cellSize
          );
        }
      }
    }
  }

  drawColonyRadius(colony) {
    const radiusInCells = Math.ceil(colony.senseRadius);
    for (let dy = -radiusInCells; dy <= radiusInCells; dy++) {
      for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= colony.senseRadius) {
          const cellScreen = this.worldToScreen(colony.x + dx, colony.y + dy);
          const alpha = Math.max(0, 1 - distance / colony.senseRadius) * 0.15;
          this.radiusCtx.fillStyle = `rgba(139, 69, 19, ${alpha})`;
          this.radiusCtx.fillRect(
            cellScreen.x,
            cellScreen.y,
            this.cellSize,
            this.cellSize
          );
        }
      }
    }
  }

  drawPlacementPreview() {
    const worldPos = this.screenToWorld(
      this.placementPreviewPos.x,
      this.placementPreviewPos.y
    );
    const previewColor = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--text-color");

    if (this.isColonyMode) {
      const previewColony = new Colony(worldPos.x, worldPos.y);
      this.drawColony(previewColony, true, false);
    } else if (this.isCheeseMode) {
      const previewCheese = new Cheese(worldPos.x, worldPos.y);
      this.drawCheese(previewCheese, true, false);
    } else {
      const previewAnt = new Ant(worldPos.x, worldPos.y, 0, previewColor);
      this.ctx.globalAlpha = 0.5;
      this.drawAnt(previewAnt);
      this.ctx.globalAlpha = 1.0;
    }

    // Draw crosshair
    const screen = this.worldToScreen(worldPos.x, worldPos.y);
    this.ctx.strokeStyle = previewColor;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(
      screen.x + this.cellSize / 2 - 10,
      screen.y + this.cellSize / 2
    );
    this.ctx.lineTo(
      screen.x + this.cellSize / 2 + 10,
      screen.y + this.cellSize / 2
    );
    this.ctx.moveTo(
      screen.x + this.cellSize / 2,
      screen.y + this.cellSize / 2 - 10
    );
    this.ctx.lineTo(
      screen.x + this.cellSize / 2,
      screen.y + this.cellSize / 2 + 10
    );
    this.ctx.stroke();
  }

  markRegionDirty(x, y) {
    // Expand the dirty region by 1 cell in each direction to ensure clean redraw
    this.dirtyRegion.minX = Math.min(this.dirtyRegion.minX, x - 1);
    this.dirtyRegion.minY = Math.min(this.dirtyRegion.minY, y - 1);
    this.dirtyRegion.maxX = Math.max(this.dirtyRegion.maxX, x + 1);
    this.dirtyRegion.maxY = Math.max(this.dirtyRegion.maxY, y + 1);
  }

  resetDirtyRegion() {
    this.dirtyRegion = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
  }

  performStep(ant) {
    const oldX = ant.x;
    const oldY = ant.y;

    // Get influences
    const cheeseInfluence = this.getCheeseInfluence(ant);
    const colonyInfluence = this.getColonyInfluence(ant);

    // Combine influences
    const influence = {
      x: cheeseInfluence.x + colonyInfluence.x,
      y: cheeseInfluence.y + colonyInfluence.y,
    };

    // Current cell color
    const isBlack = this.isCellBlack(ant.x, ant.y);

    // Toggle cell color
    this.toggleCell(ant.x, ant.y);
    this.markRegionDirty(ant.x, ant.y);

    // Calculate new direction with influences
    if (isBlack) {
      ant.direction = (ant.direction + 3) % 4; // Left turn
    } else {
      ant.direction = (ant.direction + 1) % 4; // Right turn
    }

    // Apply influence to modify direction
    if (Math.abs(influence.x) > 0 || Math.abs(influence.y) > 0) {
      // Higher chance to follow influence when carrying cheese
      const influenceChance = ant.isCarryingCheese ? 0.4 : 0.2;
      if (Math.random() < influenceChance) {
        const desiredAngle = Math.atan2(influence.y, influence.x);
        const desiredDirection =
          Math.round(
            ((desiredAngle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)
          ) % 4;

        // Higher chance to turn towards target when carrying cheese
        const turnChance = ant.isCarryingCheese ? 0.7 : 0.5;
        if (Math.random() < turnChance) {
          ant.direction = desiredDirection;
        }
      }
    }

    // Move forward using pre-calculated vectors
    const vector = this.directionVectors[ant.direction];
    ant.x += vector.x;
    ant.y += vector.y;

    // Mark both old and new positions as dirty
    this.markRegionDirty(oldX, oldY);
    this.markRegionDirty(ant.x, ant.y);

    ant.steps++;
  }

  animate(currentTime) {
    if (!this.isRunning) return;

    // Calculate time delta and accumulate time
    const deltaTime = Math.min(currentTime - this.lastFrameTime, 50); // Cap delta time to prevent huge jumps
    this.lastFrameTime = currentTime;
    this.stepAccumulator += deltaTime;

    // Calculate how many steps to perform this frame
    const stepsToPerform = Math.min(
      Math.floor((this.stepAccumulator * this.speed) / 1000),
      this.maxStepsPerFrame
    );

    if (stepsToPerform > 0) {
      // Perform multiple steps
      for (let i = 0; i < stepsToPerform; i++) {
        this.ants.forEach((ant) => this.performStep(ant));
        this.stepCount++;
      }

      // Update HUD less frequently for better performance
      if (
        this.stepCount % (this.speed > 1000 ? 100 : this.hudUpdateInterval) ===
        0
      ) {
        this.updateHUD();
      }

      // Reset accumulator
      this.stepAccumulator = 0;

      // Optimized drawing - reduce draw frequency at very high speeds
      if (this.speed <= 1000 || this.stepCount % 10 === 0) {
        this.draw(false);
      }
    }

    this.animationId = requestAnimationFrame(this.animate.bind(this));
  }

  step() {
    this.ants.forEach((ant) => {
      // Current cell color
      const isBlack = this.isCellBlack(ant.x, ant.y);

      // Toggle cell color
      this.toggleCell(ant.x, ant.y);

      // Turn and move
      if (isBlack) {
        // On black, turn left
        ant.direction = (ant.direction + 3) % 4;
      } else {
        // On white, turn right
        ant.direction = (ant.direction + 1) % 4;
      }

      // Move forward
      switch (ant.direction) {
        case 0:
          ant.y--;
          break; // Up
        case 1:
          ant.x++;
          break; // Right
        case 2:
          ant.y++;
          break; // Down
        case 3:
          ant.x--;
          break; // Left
      }

      ant.steps++;
    });

    this.stepCount++;
    this.updateHUD();
    this.draw();
  }

  getCellKey(x, y) {
    return `${x},${y}`;
  }

  isCellBlack(x, y) {
    // const value = this.grid.get(this.getCellKey(x, y));
    // return value !== undefined && value !== false;
    const value = this.grid.get(this.getCellKey(x, y));
    return value !== undefined;
  }

  toggleCell(x, y) {
    const key = this.getCellKey(x, y);

    if (this.grid.has(key)) {
      this.grid.delete(key);
    } else {
      this.grid.set(key, this.stepCount);
    }
  }

  getCellStepNumber(x, y) {
    // Return 1 for black cells, 0 for white cells
    return this.grid.get(this.getCellKey(x, y)) || 0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.stepAccumulator = 0;
    this.animate(this.lastFrameTime);
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  reset() {
    this.stop();
    this.grid.clear();
    this.ants = [new Ant()];
    this.stepCount = 0;

    // Clear all cheese
    this.cheeses = [];

    // Reset colony
    this.colony = null;

    // Reset HUD
    this.updateHUD();
    document.getElementById("colonyStats").textContent = "Colony Cheese: 0";

    // Reset view and redraw
    this.centerView();
    this.needsFullRedraw = true;
    this.draw();
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  // Add method to cancel placement mode
  cancelPlacement() {
    if (this.isPlacementMode) {
      this.isPlacementMode = false;
      this.placementPreviewPos = null;
      this.canvas.style.cursor = "grab";
      this.draw();
    }
  }

  // Calculate influence from nearby cheese and handle pickup
  getCheeseInfluence(ant) {
    let influence = { x: 0, y: 0 };

    // If already carrying cheese, no influence needed
    if (ant.isCarryingCheese) {
      return influence;
    }

    for (let i = this.cheeses.length - 1; i >= 0; i--) {
      const cheese = this.cheeses[i];
      const dx = cheese.x - ant.x;
      const dy = cheese.y - ant.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check for cheese pickup (when very close)
      if (distance < 1) {
        ant.isCarryingCheese = true;
        // Mark cheese as being carried before removing it
        cheese.isBeingCarried = true;
        // Remove the cheese from the scene
        this.cheeses.splice(i, 1);
        this.updateAntsList(); // Update HUD to show cheese status
        return influence;
      }

      if (distance <= cheese.senseRadius) {
        // Strength decreases with distance
        const strength = 1 - distance / cheese.senseRadius;
        influence.x += (dx / distance) * strength;
        influence.y += (dy / distance) * strength;
      }
    }

    return influence;
  }

  // Get direction to colony for ants carrying cheese
  getColonyInfluence(ant) {
    if (!this.colony || !ant.isCarryingCheese) return { x: 0, y: 0 };

    const dx = this.colony.x - ant.x;
    const dy = this.colony.y - ant.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check for cheese deposit
    if (distance < 1) {
      ant.isCarryingCheese = false;
      this.colony.cheeseCollected++;
      // Update colony stats in HUD
      document.getElementById(
        "colonyStats"
      ).textContent = `Colony Cheese: ${this.colony.cheeseCollected}`;
      this.updateAntsList();
      return { x: 0, y: 0 };
    }

    if (distance <= this.colony.senseRadius) {
      // Stronger influence than cheese to ensure ants return home
      const strength = 1.5 * (1 - distance / this.colony.senseRadius);
      return {
        x: (dx / distance) * strength,
        y: (dy / distance) * strength,
      };
    }

    return { x: 0, y: 0 };
  }

  // Update window resize handler
  handleResize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.radiusCanvas.width = window.innerWidth;
    this.radiusCanvas.height = window.innerHeight;
    this.viewportWidth = canvas.width;
    this.viewportHeight = canvas.height;
    this.draw();
  }
}

// Initialize the simulation when the page loads
window.addEventListener("load", () => {
  const canvas = document.getElementById("antCanvas");

  // Set canvas size to match window
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ant = new LangtonAnt(canvas);

  // Add event listeners for controls
  document
    .getElementById("startBtn")
    .addEventListener("click", () => ant.start());
  document
    .getElementById("stopBtn")
    .addEventListener("click", () => ant.stop());
  document
    .getElementById("resetBtn")
    .addEventListener("click", () => ant.reset());
  document
    .getElementById("speed")
    .addEventListener("input", (e) => ant.setSpeed(parseInt(e.target.value)));

  // Add minimize/maximize functionality
  const hud = document.querySelector(".hud");
  const minimizeBtn = document.getElementById("minimizeHUD");
  minimizeBtn.addEventListener("click", () => {
    hud.classList.toggle("minimized");
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ant.viewportWidth = canvas.width;
    ant.viewportHeight = canvas.height;
    ant.draw();
  });

  // Start the simulation automatically
  ant.start();
});
