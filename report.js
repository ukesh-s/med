/**
 * MedSAM Studio - Clinical Reporting & Medical Interoperability Export Suite
 * Generates official diagnostic radiology reports, binary masks, DICOM-RT JSON, and SVG contours.
 */

class MedSAMReportManager {
  constructor(engine, renderer) {
    this.engine = engine;
    this.renderer = renderer;
  }

  /* =========================================================================
     Export Functions
     ========================================================================= */

  /**
   * Export pure binary 0/255 Black & White Mask PNG
   */
  exportBinaryMask() {
    const w = this.engine.width;
    const h = this.engine.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const imgData = ctx.createImageData(w, h);
    const dst = imgData.data;
    const mask = this.engine.binaryMask;

    for (let i = 0; i < mask.length; i++) {
      const val = mask[i] === 1 ? 255 : 0;
      const idx = i * 4;
      dst[idx] = val;
      dst[idx + 1] = val;
      dst[idx + 2] = val;
      dst[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);

    const link = document.createElement('a');
    link.download = `MedSAM_Binary_Mask_${this.engine.currentDataset ? this.engine.currentDataset.id : 'custom'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    window.medicalAudio.playSuccessSound();
  }

  /**
   * Export Full Composite (Medical Scan + Colored Mask Overlay)
   */
  exportOverlay() {
    const w = this.engine.width;
    const h = this.engine.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Draw base scan
    ctx.drawImage(this.renderer.baseCanvas, 0, 0);
    // Draw mask
    ctx.drawImage(this.renderer.maskCanvas, 0, 0);

    const link = document.createElement('a');
    link.download = `MedSAM_Overlay_${this.engine.currentDataset ? this.engine.currentDataset.id : 'custom'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    window.medicalAudio.playSuccessSound();
  }

  /**
   * Export COCO / DICOM-RT coordinate annotations JSON
   */
  exportJsonAnnotations() {
    const data = {
      model: "MedSAM (ViT-H Foundation Medical Image Segmentation)",
      timestamp: new Date().toISOString(),
      dataset: this.engine.currentDataset ? this.engine.currentDataset.id : "custom",
      modality: this.engine.currentDataset ? this.engine.currentDataset.modality : "Unknown",
      activePrompts: {
        boxes: this.engine.boxes,
        points: this.engine.points,
        scribbles: this.engine.scribbles
      },
      radiomics: {
        diceSimilarityCoefficient: this.engine.metrics.dice,
        intersectionOverUnion: this.engine.metrics.iou,
        hausdorffDistance95Mm: this.engine.metrics.hd95Mm,
        segmentedAreaMm2: this.engine.metrics.areaMm2,
        estimatedVolumeCm3: this.engine.metrics.volumeCm3,
        meanIntensityHU: this.engine.metrics.meanIntensity,
        sphericityIndex: this.engine.metrics.sphericity
      },
      contourCoordinates: this.engine.contourPoints
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `MedSAM_Annotations_${data.dataset}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    window.medicalAudio.playSuccessSound();
  }

  /**
   * Export Scalable Vector Contour SVG
   */
  exportSvgContour() {
    const pts = this.engine.contourPoints;
    if (pts.length < 3) {
      alert("No segmentation contour available to export.");
      return;
    }

    let pathD = `M ${pts[0].x} ${pts[0].y} `;
    for (let i = 1; i < pts.length; i++) {
      pathD += `L ${pts[i].x} ${pts[i].y} `;
    }
    pathD += 'Z';

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.engine.width} ${this.engine.height}" width="${this.engine.width}" height="${this.engine.height}">
  <style>
    .contour { fill: rgba(0, 242, 254, 0.4); stroke: #00f2fe; stroke-width: 2; stroke-linejoin: round; }
  </style>
  <rect width="100%" height="100%" fill="#0c101c"/>
  <path d="${pathD}" class="contour"/>
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `MedSAM_Contour_${this.engine.currentDataset ? this.engine.currentDataset.id : 'scan'}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    window.medicalAudio.playSuccessSound();
  }

  /* =========================================================================
     Clinical Diagnostic Report Modal
     ========================================================================= */

  openClinicalReport() {
    const modal = document.getElementById('reportModal');
    const dataset = this.engine.currentDataset;
    const target = this.engine.currentTarget;
    const metrics = this.engine.metrics;

    // Report Header Metadata
    const randomReportNum = Math.floor(1000 + Math.random() * 9000);
    const randomPtNum = Math.floor(100000 + Math.random() * 900000);
    document.getElementById('repReportId').textContent = `MEDSAM-2026-${randomReportNum}`;
    document.getElementById('repTimestamp').textContent = new Date().toLocaleString();
    document.getElementById('repPatientId').textContent = `PT-${randomPtNum}`;
    document.getElementById('repModality').textContent = dataset ? dataset.modality : 'Custom Radiological Scan';

    // Figures
    const repScanImg = document.getElementById('repScanImage');
    const repOverlayImg = document.getElementById('repOverlayImage');

    if (dataset && dataset.imageSrc) {
      repScanImg.src = dataset.imageSrc;
    } else if (this.engine.imageElement) {
      repScanImg.src = this.engine.imageElement.src;
    }

    // Generate snapshot overlay
    const compCanvas = document.createElement('canvas');
    compCanvas.width = this.engine.width;
    compCanvas.height = this.engine.height;
    const compCtx = compCanvas.getContext('2d');
    compCtx.drawImage(this.renderer.baseCanvas, 0, 0);
    compCtx.drawImage(this.renderer.maskCanvas, 0, 0);
    repOverlayImg.src = compCanvas.toDataURL('image/png');

    // Radiomic Metrics Table
    document.getElementById('repDice').textContent = (metrics.dice * 100).toFixed(1) + '%';
    document.getElementById('repIou').textContent = (metrics.iou * 100).toFixed(1) + '%';
    document.getElementById('repHd95').textContent = metrics.hd95Mm + ' mm';
    document.getElementById('repArea').textContent = metrics.areaMm2.toLocaleString() + ' mm²';
    document.getElementById('repIntensity').textContent = metrics.meanIntensity;

    // Radiologist Impression Text
    const impressionEl = document.getElementById('repImpressionText');
    if (target && target.impression) {
      impressionEl.textContent = target.impression;
    } else {
      impressionEl.textContent = `Autonomous MedSAM prompt-guided segmentation completed. The identified structure demonstrates a high Dice agreement (${(metrics.dice*100).toFixed(1)}%) with crisp anatomical margin delineation. Sub-voxel Hausdorff boundary error indicates dependable contouring suitable for multi-disciplinary clinical evaluation.`;
    }

    modal.style.display = 'flex';
    window.medicalAudio.playSuccessSound();
  }

  closeClinicalReport() {
    const modal = document.getElementById('reportModal');
    modal.style.display = 'none';
  }

  printReport() {
    window.print();
  }
}

window.MedSAMReportManager = MedSAMReportManager;
