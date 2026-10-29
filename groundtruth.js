/**
 * MedSAM Studio - Clinical Ground Truth & Anatomical Prior Knowledge Base
 * Defines ground truth segmentations, modalities, radiomic baselines, and semantic text prompts
 */

const MEDICAL_DATASETS = {
  brain_mri: {
    id: "brain_mri",
    title: "Brain MRI (Axial T1-weighted Contrast)",
    shortTitle: "Brain MRI (Axial)",
    modality: "MRI T1-Gd",
    lesionLabel: "Glioblastoma Multiforme (GBM)",
    imageSrc: "assets/images/brain_mri.jpg",
    pixelSpacingMm: 0.95, // 0.95 mm per pixel
    sliceThicknessMm: 1.0,
    windowPresets: {
      default: { wl: 128, ww: 256 },
      brain: { wl: 110, ww: 180 },
      bone: { wl: 200, ww: 350 },
      soft_tissue: { wl: 135, ww: 220 }
    },
    // Primary ground truth lesion target (Ring-enhancing glioblastoma)
    primaryTarget: {
      name: "Glioblastoma Tumor Core & Enhancing Rim",
      key: "gbm_core",
      // Bounding box in 600x600 canvas coordinate space
      box: [100, 240, 240, 380], // [x1, y1, x2, y2]
      points: [
        { x: 165, y: 305, label: 1 } // positive seed inside lesion
      ],
      // Anatomical shape parameters for ground truth mask synthesis
      center: { x: 166, y: 312 },
      radiusX: 64,
      radiusY: 62,
      roughness: 0.16,
      hounsfieldUnits: 42.8,
      expectedDice: 0.948,
      expectedIou: 0.902,
      expectedHd95: 1.34,
      expectedAreaMm2: 1842,
      expectedVolumeCm3: 14.6,
      impression: "Focal heterogeneous ring-enhancing mass in the right frontoparietal white matter consistent with high-grade Glioblastoma Multiforme (GBM). Prompt-driven MedSAM segmentation demonstrates sharp delineation of the hyperintense border without crossing the midline."
    },
    // Secondary anatomical structures
    secondaryTargets: [
      {
        name: "Lateral Ventricles",
        key: "ventricles",
        box: [240, 180, 350, 330],
        points: [{ x: 295, y: 245, label: 1 }],
        center: { x: 295, y: 250 },
        radiusX: 42,
        radiusY: 70,
        expectedDice: 0.925
      }
    ],
    // Semantic language prompts recognized by MedSAM
    semanticQueries: {
      "glioblastoma": "gbm_core",
      "tumor": "gbm_core",
      "lesion": "gbm_core",
      "mass": "gbm_core",
      "gbm": "gbm_core",
      "ventricle": "ventricles",
      "ventricles": "ventricles"
    }
  },

  chest_ct: {
    id: "chest_ct",
    title: "Chest CT (Axial Lung Window)",
    shortTitle: "Chest CT (Axial)",
    modality: "CT Lung Window",
    lesionLabel: "Solitary Pulmonary Nodule (SPN)",
    imageSrc: "assets/images/chest_ct.jpg",
    pixelSpacingMm: 0.72,
    sliceThicknessMm: 1.25,
    windowPresets: {
      default: { wl: 128, ww: 256 },
      lung: { wl: 70, ww: 300 },
      bone: { wl: 220, ww: 400 },
      soft_tissue: { wl: 140, ww: 200 }
    },
    primaryTarget: {
      name: "Right Lung Solitary Pulmonary Nodule",
      key: "lung_nodule",
      box: [120, 285, 192, 358],
      points: [
        { x: 154, y: 322, label: 1 }
      ],
      center: { x: 155, y: 322 },
      radiusX: 32,
      radiusY: 33,
      roughness: 0.08,
      hounsfieldUnits: -140.0,
      expectedDice: 0.961,
      expectedIou: 0.925,
      expectedHd95: 0.98,
      expectedAreaMm2: 648,
      expectedVolumeCm3: 4.2,
      impression: "Well-circumscribed solitary soft-tissue pulmonary nodule in the anterior segment of the right upper lobe. MedSAM prompt segmentation successfully isolates nodular margin from adjacent pulmonary vasculature with sub-millimeter Hausdorff precision (0.98 mm)."
    },
    secondaryTargets: [
      {
        name: "Right Lung Field",
        key: "right_lung",
        box: [80, 150, 285, 470],
        points: [{ x: 180, y: 300, label: 1 }],
        center: { x: 180, y: 310 },
        radiusX: 95,
        radiusY: 150,
        expectedDice: 0.952
      }
    ],
    semanticQueries: {
      "nodule": "lung_nodule",
      "pulmonary nodule": "lung_nodule",
      "spn": "lung_nodule",
      "tumor": "lung_nodule",
      "lesion": "lung_nodule",
      "lung": "right_lung",
      "right lung": "right_lung"
    }
  },

  retinal_fundus: {
    id: "retinal_fundus",
    title: "Digital Retinal Fundus Ophthalmoscopy",
    shortTitle: "Retinal Fundus",
    modality: "Color Fundus Photography",
    lesionLabel: "Optic Cup & Disc (Glaucoma Screening)",
    imageSrc: "assets/images/retinal_fundus.jpg",
    pixelSpacingMm: 0.018,
    sliceThicknessMm: 0,
    windowPresets: {
      default: { wl: 128, ww: 256 },
      fundus_sharp: { wl: 140, ww: 200 }
    },
    primaryTarget: {
      name: "Physiological Optic Cup",
      key: "optic_cup",
      box: [148, 258, 222, 332],
      points: [
        { x: 185, y: 295, label: 1 }
      ],
      center: { x: 185, y: 295 },
      radiusX: 34,
      radiusY: 34,
      roughness: 0.05,
      hounsfieldUnits: 215.0, // High reflectance
      expectedDice: 0.934,
      expectedIou: 0.876,
      expectedHd95: 1.62,
      expectedAreaMm2: 1.18,
      expectedVolumeCm3: 0.05,
      cupToDiscRatio: 0.58,
      impression: "Clear depiction of the neuroretinal rim and optic nerve head. Segmented optic cup diameter yields a Cup-to-Disc Ratio (CDR) of 0.58, within standard physiological baseline (< 0.60 threshold). MedSAM effectively separates pallor boundary despite overlying retinal central vessels."
    },
    secondaryTargets: [
      {
        name: "Optic Disc Margin",
        key: "optic_disc",
        box: [126, 236, 244, 354],
        points: [{ x: 185, y: 295, label: 1 }],
        center: { x: 185, y: 295 },
        radiusX: 58,
        radiusY: 58,
        expectedDice: 0.958
      }
    ],
    semanticQueries: {
      "optic cup": "optic_cup",
      "cup": "optic_cup",
      "cup-to-disc": "optic_cup",
      "optic disc": "optic_disc",
      "disc": "optic_disc",
      "glaucoma": "optic_cup"
    }
  },

  histology: {
    id: "histology",
    title: "Histopathology Biopsy Slide (H&E Stain 40x)",
    shortTitle: "Histopathology",
    modality: "H&E Microscopic Slide",
    lesionLabel: "Infiltrating Ductal Carcinoma Nuclei",
    imageSrc: "assets/images/histology.jpg",
    pixelSpacingMm: 0.0005, // 0.5 micron
    sliceThicknessMm: 0.005,
    windowPresets: {
      default: { wl: 128, ww: 256 },
      path_dense: { wl: 110, ww: 210 }
    },
    primaryTarget: {
      name: "Ductal Carcinoma Nuclei Cluster",
      key: "ductal_nuclei",
      box: [130, 130, 360, 500],
      points: [
        { x: 245, y: 315, label: 1 }
      ],
      center: { x: 245, y: 315 },
      radiusX: 98,
      radiusY: 165,
      roughness: 0.22,
      hounsfieldUnits: 88.0,
      expectedDice: 0.927,
      expectedIou: 0.865,
      expectedHd95: 2.10,
      expectedAreaMm2: 0.048,
      expectedVolumeCm3: 0.001,
      impression: "Malignant architectural nest of hyperchromatic pleomorphic carcinoma cell nuclei with dense nuclear-cytoplasmic ratio. MedSAM prompt guidance captures intricate multi-nuclei border without encroaching into adjacent eosinophilic stromal tissue."
    },
    secondaryTargets: [
      {
        name: "Gland Lumen",
        key: "gland_lumen",
        box: [370, 270, 500, 410],
        points: [{ x: 435, y: 340, label: 1 }],
        center: { x: 435, y: 340 },
        radiusX: 55,
        radiusY: 60,
        expectedDice: 0.910
      }
    ],
    semanticQueries: {
      "nuclei": "ductal_nuclei",
      "carcinoma": "ductal_nuclei",
      "cancer": "ductal_nuclei",
      "tumor": "ductal_nuclei",
      "lumen": "gland_lumen",
      "stroma": "ductal_nuclei"
    }
  }
};

/**
 * Procedural ground-truth organic shape rasterizer
 * Generates an exact 2D binary uint8 mask for a given anatomical target
 */
function createGroundTruthBinaryMask(target, width = 600, height = 600) {
  const mask = new Uint8Array(width * height);
  const cx = target.center.x;
  const cy = target.center.y;
  const rx = target.radiusX;
  const ry = target.radiusY;
  const roughness = target.roughness || 0.1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Add pseudo-random harmonic roughness based on angle for organic medical boundaries
      const angle = Math.atan2(dy, dx);
      const harmonicNoise = Math.sin(angle * 5 + 1.2) * roughness * 0.5 + 
                            Math.cos(angle * 3) * roughness * 0.35 +
                            Math.sin(angle * 9) * roughness * 0.15;
      
      if (dist + harmonicNoise <= 1.0) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

window.MEDICAL_DATASETS = MEDICAL_DATASETS;
window.createGroundTruthBinaryMask = createGroundTruthBinaryMask;
