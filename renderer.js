/**
 * MedSAM Studio - Multi-Layer Canvas Renderer & High-Tech Visual Effects
 * Renders base scan with Window/Level & Colormap LUTs, glowing segmentation masks,
 * marching ants contours, interactive prompt overlays, split curtain, and 3D elevation.
 */

class MedSAMRenderer {
  constructor(engine) {
    this.engine = engine;
    this.width = 600;
    this.height = 600;

    // Canvas elements
    this.baseCanvas = document.getElementById('baseScanCanvas');
    this.heatmapCanvas = document.getElementById('heatmapCanvas');
    this.maskCanvas = document.getElementById('maskCanvas');
    this.promptCanvas = document.getElementById('promptOverlayCanvas');
    this.surfaceCanvas = document.getElementById('surfaceCanvas');
    this.magnifierCanvas = document.getElementById('magnifierCanvas');

    // Contexts
    this.baseCtx = this.baseCanvas.getContext('2d');
    this.heatmapCtx = this.heatmapCanvas.getContext('2d');
    this.maskCtx = this.maskCanvas.getContext('2d');
    this.promptCtx = this.promptCanvas.getContext('2d');
    this.surfaceCtx = this.surfaceCanvas.getContext('2d');
    this.magnifierCtx = this.magnifierCanvas ? this.magnifierCanvas.getContext('2d') : null;

    // Display Options
    this.showMask = true;
    this.showContour = true;
    this.showUncertainty = false;
    this.maskOpacity = 0.55;
    this.maskColor = '#00f2fe';
    this.isInverted = false;
    this.colormap = 'grayscale';
    this.windowLevel = 128;
    this.windowWidth = 256;

    // Viewport Zoom & Pan
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Split View Curtain
    this.isSplitView = false;
    this.splitX = 300; // Curtain divider position

    // 3D Elevation Mode
    this.is3dMode = false;
    this.elevationAngle = 0.6;

    // Animation ticker for marching ants & pulse ripples
    this.animationFrame = null;
    this.dashOffset = 0;
    this.pulsePhase = 0;

    // Cached offscreen raw image canvas
    this.rawImgCanvas = document.createElement('canvas');
    this.rawImgCanvas.width = this.width;
    this.rawImgCanvas.height = this.height;
    this.rawImgCtx = this.rawImgCanvas.getContext('2d');

    this.startAnimationLoop();
  }

  /**
   * Set raw image and pre-render
   */
  setImage(img) {
    this.rawImgCtx.clearRect(0, 0, this.width, this.height);
    this.rawImgCtx.drawImage(img, 0, 0, this.width, this.height);
    this.renderAll();
  }

  /**
   * Main render orchestrator
   */
  renderAll() {
    this.renderBaseScan();
    this.renderHeatmap();
    this.renderMask();
    this.renderPrompts();
    if (this.is3dMode) {
      this.render3dSurface();
    }
  }

  /* =========================================================================
     Layer 1: Base Scan with Window/Level & Colormap LUTs
     ========================================================================= */

  renderBaseScan() {
    const w = this.width;
    const h = this.height;

    // Retrieve raw image pixels
    const rawData = this.rawImgCtx.getImageData(0, 0, w, h);
    const src = rawData.data;

    const outData = this.baseCtx.createImageData(w, h);
    const dst = outData.data;

    const wl = this.windowLevel;
    const ww = Math.max(10, this.windowWidth);
    const low = wl - ww / 2;
    const high = wl + ww / 2;
    const inv = this.isInverted;
    const cmap = this.colormap;

    for (let i = 0; i < src.length; i += 4) {
      // 1. Grayscale luminance
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // 2. Window / Level contrast mapping
      let val = (lum - low) / (high - low);
      val = Math.max(0, Math.min(1, val));
      if (inv) val = 1.0 - val;

      // 3. Colormap LUT lookup
      const color = this.applyColormap(val, cmap, r, g, b);

      dst[i]     = color[0];
      dst[i + 1] = color[1];
      dst[i + 2] = color[2];
      dst[i + 3] = 255;
    }

    this.baseCtx.putImageData(outData, 0, 0);
  }

  applyColormap(val, map, origR, origG, origB) {
    if (map === 'original') {
      const lum = (0.299 * origR + 0.587 * origG + 0.114 * origB) / 255;
      const factor = lum > 0.01 ? Math.min(2.0, val / lum) : 1;
      return [
        Math.min(255, Math.round(origR * factor)),
        Math.min(255, Math.round(origG * factor)),
        Math.min(255, Math.round(origB * factor))
      ];
    }
    // val is [0.0, 1.0]
    if (map === 'grayscale') {
      const v = Math.round(val * 255);
      return [v, v, v];
    }
    if (map === 'jet') {
      // Classic Jet / Rainbow Heatmap
      let r = Math.max(0, Math.min(1, 1.5 - Math.abs(val * 4 - 3)));
      let g = Math.max(0, Math.min(1, 1.5 - Math.abs(val * 4 - 2)));
      let b = Math.max(0, Math.min(1, 1.5 - Math.abs(val * 4 - 1)));
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    if (map === 'viridis') {
      // Perceptually uniform Viridis approximation
      const r = Math.round(255 * (0.2 + 0.8 * Math.sin(val * Math.PI * 0.9)));
      const g = Math.round(255 * Math.sin(val * Math.PI));
      const b = Math.round(255 * (0.6 + 0.4 * Math.cos(val * Math.PI)));
      return [r, g, b];
    }
    if (map === 'hot') {
      // Hot Iron (Black -> Red -> Yellow -> White)
      let r = Math.min(255, Math.round(val * 3 * 255));
      let g = val > 0.33 ? Math.min(255, Math.round((val - 0.33) * 3 * 255)) : 0;
      let b = val > 0.66 ? Math.min(255, Math.round((val - 0.66) * 3 * 255)) : 0;
      return [r, g, b];
    }
    if (map === 'bone') {
      // Bone CT high-contrast cool tint
      const v = val * 255;
      const r = Math.round(v * 0.85);
      const g = Math.round(v * 0.92);
      const b = Math.round(Math.min(255, v * 1.15 + (val > 0.8 ? 30 : 0)));
      return [r, g, b];
    }
    if (map === 'pet') {
      // PET-CT Metabolic Fusion
      if (val > 0.65) {
        // Hypermetabolic tracer uptake (Hot Yellow-Red)
        return [255, Math.round((1 - (val - 0.65) / 0.35) * 200), 20];
      }
      const v = Math.round(val * 255);
      return [v, v, v];
    }
    return [Math.round(val * 255), Math.round(val * 255), Math.round(val * 255)];
  }

  /* =========================================================================
     Layer 2: Uncertainty & Confidence Heatmap
     ========================================================================= */

  renderHeatmap() {
    this.heatmapCtx.clearRect(0, 0, this.width, this.height);
    if (!this.showUncertainty) {
      this.heatmapCanvas.style.opacity = '0';
      return;
    }
    this.heatmapCanvas.style.opacity = '1';

    const w = this.width;
    const h = this.height;
    const logits = this.engine.logitsMap;
    const imgData = this.heatmapCtx.createImageData(w, h);
    const dst = imgData.data;

    for (let i = 0; i < logits.length; i++) {
      const p = logits[i];
      if (p > 0.05) {
        // High confidence = Emerald/Cyan, Border Uncertainty = Amber/Crimson
        const uncertainty = 1.0 - Math.abs(p - 0.5) * 2; // Peak uncertainty around 0.5 decision boundary
        const idx = i * 4;
        
        dst[idx]     = Math.round(uncertainty * 255);
        dst[idx + 1] = Math.round((1 - uncertainty) * 240);
        dst[idx + 2] = Math.round((1 - uncertainty) * 255);
        dst[idx + 3] = Math.round((p * 0.6 + uncertainty * 0.3) * 255);
      }
    }

    this.heatmapCtx.putImageData(imgData, 0, 0);
  }

  /* =========================================================================
     Layer 3: Segmentation Mask & Glowing Marching Ants Contours
     ========================================================================= */

  renderMask() {
    this.maskCtx.clearRect(0, 0, this.width, this.height);

    const mask = this.engine.binaryMask;
    const w = this.width;
    const h = this.height;

    // Parse mask fill color
    const hex = this.maskColor.replace('#', '');
    const cr = parseInt(hex.substring(0, 2), 16) || 0;
    const cg = parseInt(hex.substring(2, 4), 16) || 242;
    const cb = parseInt(hex.substring(4, 6), 16) || 254;

    // Split view boundary limit
    const splitLimit = this.isSplitView ? this.splitX : 0;

    // 1. Render Mask Fill
    if (this.showMask) {
      const imgData = this.maskCtx.createImageData(w, h);
      const dst = imgData.data;
      const alpha = Math.round(this.maskOpacity * 255);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (this.isSplitView && x < splitLimit) continue; // In split view, left side is raw scan
          const idx = y * w + x;
          if (mask[idx] === 1) {
            const di = idx * 4;
            dst[di]     = cr;
            dst[di + 1] = cg;
            dst[di + 2] = cb;
            dst[di + 3] = alpha;
          }
        }
      }
      this.maskCtx.putImageData(imgData, 0, 0);
    }

    // 2. Render Animated Glowing Contour & Marching Ants
    if (this.showContour && this.engine.contourPoints.length > 2) {
      this.maskCtx.save();
      
      if (this.isSplitView) {
        this.maskCtx.beginPath();
        this.maskCtx.rect(splitLimit, 0, w - splitLimit, h);
        this.maskCtx.clip();
      }

      const pts = this.engine.contourPoints;

      // Glow halo
      this.maskCtx.shadowColor = this.maskColor;
      this.maskCtx.shadowBlur = 14;
      this.maskCtx.strokeStyle = this.maskColor;
      this.maskCtx.lineWidth = 2.5;
      this.maskCtx.setLineDash([8, 6]);
      this.maskCtx.lineDashOffset = -this.dashOffset;

      this.maskCtx.beginPath();
      this.maskCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        this.maskCtx.lineTo(pts[i].x, pts[i].y);
      }
      this.maskCtx.closePath();
      this.maskCtx.stroke();

      // Sharp inner crisp line
      this.maskCtx.shadowBlur = 0;
      this.maskCtx.strokeStyle = '#ffffff';
      this.maskCtx.lineWidth = 1;
      this.maskCtx.setLineDash([4, 4]);
      this.maskCtx.lineDashOffset = this.dashOffset;
      this.maskCtx.stroke();

      this.maskCtx.restore();
    }
  }

  /* =========================================================================
     Layer 4: Interactive Prompts Overlay (Boxes, Points, Handles, HUD)
     ========================================================================= */

  renderPrompts() {
    this.promptCtx.clearRect(0, 0, this.width, this.height);

    // 1. Render Bounding Boxes
    this.engine.boxes.forEach((box, bIdx) => {
      const [x1, y1, x2, y2] = box;
      const bw = x2 - x1;
      const bh = y2 - y1;

      this.promptCtx.save();
      this.promptCtx.shadowColor = 'rgba(0, 242, 254, 0.6)';
      this.promptCtx.shadowBlur = 8;
      this.promptCtx.strokeStyle = '#00f2fe';
      this.promptCtx.lineWidth = 1.8;
      this.promptCtx.setLineDash([6, 4]);
      this.promptCtx.strokeRect(x1, y1, bw, bh);

      // Corner Grab Handles
      const handleSize = 7;
      const corners = [
        { x: x1, y: y1 }, { x: x2, y: y1 },
        { x: x1, y: y2 }, { x: x2, y: y2 }
      ];
      corners.forEach(c => {
        this.promptCtx.fillStyle = '#00f2fe';
        this.promptCtx.fillRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
        this.promptCtx.fillStyle = '#05101f';
        this.promptCtx.fillRect(c.x - 2, c.y - 2, 4, 4);
      });

      // HUD Coordinate Badge on top edge
      const spacing = this.engine.currentDataset ? this.engine.currentDataset.pixelSpacingMm : 1.0;
      const wMm = (bw * spacing).toFixed(1);
      const hMm = (bh * spacing).toFixed(1);
      const label = `MedSAM ROI [${x1}, ${y1}] • ${wMm}x${hMm}mm`;

      this.promptCtx.font = '600 10.5px JetBrains Mono, monospace';
      const textWidth = this.promptCtx.measureText(label).width;

      this.promptCtx.fillStyle = 'rgba(8, 14, 26, 0.85)';
      this.promptCtx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
      this.promptCtx.lineWidth = 1;
      this.promptCtx.setLineDash([]);
      this.promptCtx.fillRect(x1, Math.max(0, y1 - 22), textWidth + 16, 20);
      this.promptCtx.strokeRect(x1, Math.max(0, y1 - 22), textWidth + 16, 20);

      this.promptCtx.fillStyle = '#00f2fe';
      this.promptCtx.fillText(label, x1 + 8, Math.max(14, y1 - 8));

      this.promptCtx.restore();
    });

    // 2. Render Point Prompts (Positive + & Negative -)
    this.engine.points.forEach((pt, pIdx) => {
      const isPos = pt.label === 1;
      const baseColor = isPos ? '#00f5a0' : '#ff4b72';

      this.promptCtx.save();

      // Outer animated ripple ring
      const rippleRadius = 14 + (Math.sin(this.pulsePhase + pIdx) * 3);
      this.promptCtx.strokeStyle = isPos ? 'rgba(0, 245, 160, 0.35)' : 'rgba(255, 75, 114, 0.35)';
      this.promptCtx.lineWidth = 1.5;
      this.promptCtx.beginPath();
      this.promptCtx.arc(pt.x, pt.y, rippleRadius, 0, Math.PI * 2);
      this.promptCtx.stroke();

      // Inner Core Circle
      this.promptCtx.shadowColor = baseColor;
      this.promptCtx.shadowBlur = 10;
      this.promptCtx.fillStyle = baseColor;
      this.promptCtx.beginPath();
      this.promptCtx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      this.promptCtx.fill();

      // Center Sign (+ or -)
      this.promptCtx.shadowBlur = 0;
      this.promptCtx.strokeStyle = '#050a12';
      this.promptCtx.lineWidth = 2;
      this.promptCtx.beginPath();
      if (isPos) {
        // Plus sign
        this.promptCtx.moveTo(pt.x - 3, pt.y);
        this.promptCtx.lineTo(pt.x + 3, pt.y);
        this.promptCtx.moveTo(pt.x, pt.y - 3);
        this.promptCtx.lineTo(pt.x, pt.y + 3);
      } else {
        // Minus sign
        this.promptCtx.moveTo(pt.x - 3, pt.y);
        this.promptCtx.lineTo(pt.x + 3, pt.y);
      }
      this.promptCtx.stroke();

      this.promptCtx.restore();
    });

    // 3. Render Scribbles
    this.engine.scribbles.forEach(stroke => {
      if (stroke.length < 2) return;
      this.promptCtx.save();
      this.promptCtx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
      this.promptCtx.lineWidth = 4;
      this.promptCtx.lineCap = 'round';
      this.promptCtx.lineJoin = 'round';
      this.promptCtx.beginPath();
      this.promptCtx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        this.promptCtx.lineTo(stroke[i].x, stroke[i].y);
      }
      this.promptCtx.stroke();
      this.promptCtx.restore();
    });
  }

  /* =========================================================================
     Layer 5: Pseudo-3D Volumetric Lesion Elevation Surface Map
     ========================================================================= */

  render3dSurface() {
    const ctx = this.surfaceCtx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    // Deep sci-fi grid background
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.lineWidth = 1;
    const gridStep = 40;
    for (let x = 0; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Isometric 3D wireframe elevation projection of segmented lesion
    const mask = this.engine.binaryMask;
    const gray = this.engine.grayscaleBuffer;
    const step = 8; // Mesh resolution step
    const scaleZ = 0.45;
    const isoAngle = Math.PI / 6; // 30 deg

    const cosIso = Math.cos(isoAngle);
    const sinIso = Math.sin(isoAngle);

    ctx.save();
    ctx.translate(w / 2, h / 2 + 50);

    for (let y = 100; y < h - 100; y += step) {
      ctx.beginPath();
      let started = false;

      for (let x = 100; x < w - 100; x += step) {
        const idx = y * w + x;
        const isMasked = mask[idx] === 1;
        const elev = isMasked ? (gray[idx] * scaleZ) : 0;

        // Isometric coordinate transform
        const isoX = (x - w/2) * cosIso - (y - h/2) * cosIso;
        const isoY = ((x - w/2) * sinIso + (y - h/2) * sinIso) * 0.65 - elev;

        if (!started) {
          ctx.moveTo(isoX, isoY);
          started = true;
        } else {
          ctx.lineTo(isoX, isoY);
        }
      }

      ctx.strokeStyle = 'rgba(0, 242, 254, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.restore();
  }

  /* =========================================================================
     Magnifier Loupe (PIP Zoom Lens)
     ========================================================================= */

  updateMagnifier(mouseX, mouseY) {
    if (!this.magnifierCtx) return;
    const zoomFactor = 2.8;
    const mw = 140;
    const mh = 140;

    this.magnifierCtx.clearRect(0, 0, mw, mh);
    
    // Draw magnified composite from base canvas
    const srcW = mw / zoomFactor;
    const srcH = mh / zoomFactor;
    const srcX = Math.max(0, Math.min(this.width - srcW, mouseX - srcW / 2));
    const srcY = Math.max(0, Math.min(this.height - srcH, mouseY - srcH / 2));

    this.magnifierCtx.drawImage(this.baseCanvas, srcX, srcY, srcW, srcH, 0, 0, mw, mh);
    if (this.showMask) {
      this.magnifierCtx.drawImage(this.maskCanvas, srcX, srcY, srcW, srcH, 0, 0, mw, mh);
    }
  }

  /* =========================================================================
     Animation Loop for Marching Ants and Pulse Rings
     ========================================================================= */

  startAnimationLoop() {
    const loop = () => {
      this.dashOffset = (this.dashOffset + 0.4) % 16;
      this.pulsePhase = (this.pulsePhase + 0.05) % (Math.PI * 2);

      if (this.showContour && this.engine.contourPoints.length > 2) {
        this.renderMask();
      }
      if (this.engine.points.length > 0) {
        this.renderPrompts();
      }

      this.animationFrame = requestAnimationFrame(loop);
    };
    this.animationFrame = requestAnimationFrame(loop);
  }

  triggerLaserScanner() {
    const scanner = document.getElementById('laserScanner');
    if (scanner) {
      scanner.classList.remove('scanning');
      void scanner.offsetWidth; // Trigger reflow
      scanner.classList.add('scanning');
      setTimeout(() => scanner.classList.remove('scanning'), 2000);
    }
  }
}

window.MedSAMRenderer = MedSAMRenderer;
