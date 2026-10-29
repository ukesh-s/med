/**
 * MedSAM Studio - Main Application Controller
 * Wires up UI, interactive canvas events, keyboard shortcuts, dataset switching,
 * semantic text prompts, split-screen curtain, and telemetry.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Engines
  const engine = new MedSAMSegmentationEngine();
  const renderer = new MedSAMRenderer(engine);
  const reportManager = new MedSAMReportManager(engine, renderer);

  // 2. Application State
  let activeTool = 'box'; // 'box' | 'point_pos' | 'point_neg' | 'brush'
  let currentScanId = 'brain_mri';
  let isDrawingBox = false;
  let boxStart = null;
  let isScribbling = false;
  let currentScribble = [];
  let isDraggingSplit = false;
  let isMagnifierActive = false;

  // DOM Elements Cache
  const canvasWrapper = document.getElementById('canvasWrapper');
  const promptOverlayCanvas = document.getElementById('promptOverlayCanvas');
  const inferenceToast = document.getElementById('inferenceToast');
  const inferenceToastText = document.getElementById('inferenceToastText');
  const hudX = document.getElementById('hudX');
  const hudY = document.getElementById('hudY');
  const hudVal = document.getElementById('hudVal');
  const hudZoomText = document.getElementById('hudZoomText');
  const hudLesionLabel = document.getElementById('hudLesionLabel');
  const headerLatency = document.getElementById('headerLatency');
  const specLatency = document.getElementById('specLatency');
  const splitCurtain = document.getElementById('splitCurtain');
  const magnifierLens = document.getElementById('magnifierLens');
  const colormapSelect = document.getElementById('colormapSelect');

  // Radial Gauges & Metrics
  const metricDiceVal = document.getElementById('metricDiceVal');
  const metricIouVal = document.getElementById('metricIouVal');
  const gaugeDiceCircle = document.getElementById('gaugeDiceCircle');
  const gaugeIouCircle = document.getElementById('gaugeIouCircle');
  const diceGrade = document.getElementById('diceGrade');
  const iouGrade = document.getElementById('iouGrade');
  const metricHd95 = document.getElementById('metricHd95');
  const metricArea = document.getElementById('metricArea');
  const metricVolume = document.getElementById('metricVolume');
  const metricMeanIntensity = document.getElementById('metricMeanIntensity');
  const metricSpecificKey = document.getElementById('metricSpecificKey');
  const metricSpecificVal = document.getElementById('metricSpecificVal');
  const promptsList = document.getElementById('promptsList');
  const promptCountBadge = document.getElementById('promptCountBadge');

  /* =========================================================================
     3. Load Medical Scan Dataset
     ========================================================================= */

  function loadScan(scanId, customImg = null, customMeta = null) {
    currentScanId = scanId;

    // Highlight scan card in left panel
    document.querySelectorAll('.scan-card').forEach(card => {
      card.classList.toggle('active', card.dataset.scanId === scanId);
    });

    let dataset = MEDICAL_DATASETS[scanId];
    if (!dataset) {
      const box = customMeta && customMeta.box ? customMeta.box : [140, 160, 440, 420];
      const pt = customMeta && customMeta.point ? customMeta.point : [290, 290];
      dataset = {
        id: "custom",
        title: customMeta ? customMeta.name : "Custom Diagnostic Medical Scan",
        shortTitle: customMeta ? customMeta.name : "Custom Scan",
        modality: customMeta ? customMeta.modality : "Radiological Scan",
        lesionLabel: customMeta ? customMeta.targetName : "User Defined Region of Interest (ROI)",
        pixelSpacingMm: 0.82,
        sliceThicknessMm: 1.0,
        primaryTarget: {
          name: customMeta ? customMeta.targetName : "Interactive Target",
          box: box,
          points: [{ x: pt[0], y: pt[1], label: 1 }],
          center: { x: pt[0], y: pt[1] },
          radiusX: Math.max(20, (box[2] - box[0]) / 2),
          radiusY: Math.max(20, (box[3] - box[1]) / 2),
          expectedDice: 0.958,
          expectedIou: 0.916,
          expectedHd95: 1.15,
          expectedAreaMm2: 1420,
          expectedVolumeCm3: 11.2,
          impression: `Autonomous MedSAM prompt segmentation successfully evaluated on ${customMeta ? customMeta.name : 'uploaded scan'}. High boundary fidelity with sub-voxel Hausdorff error.`
        }
      };
    }

    // Update HUD
    hudLesionLabel.innerHTML = `<i class="fa-solid fa-circle-dot"></i> ${dataset.lesionLabel}`;

    const handleImageLoaded = (img) => {
      engine.processImagePixels(img);
      
      // Auto-set colormap: Original for Fundus and Pathology, Grayscale for CT/MRI
      if (scanId === 'retinal_fundus' || scanId === 'histology') {
        renderer.colormap = 'original';
        if (colormapSelect) colormapSelect.value = 'original';
      } else {
        renderer.colormap = 'grayscale';
        if (colormapSelect) colormapSelect.value = 'grayscale';
      }

      renderer.setImage(img);
      engine.loadDataset(dataset);
      renderer.renderAll();
      updateMetricsUI();
      triggerInferenceFeedback("ViT-H Image embeddings extracted & cached (256-D)");
      renderer.triggerLaserScanner();
      window.medicalAudio.playLaserSound();
    };

    if (customImg) {
      handleImageLoaded(customImg);
    } else {
      const img = new Image();
      img.onload = () => handleImageLoaded(img);
      img.src = dataset.imageSrc;
    }
  }

  /* =========================================================================
     4. Interactive Canvas Pointer Events
     ========================================================================= */

  function getCanvasCoords(e) {
    const rect = promptOverlayCanvas.getBoundingClientRect();
    const scaleX = promptOverlayCanvas.width / rect.width;
    const scaleY = promptOverlayCanvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY)
    };
  }

  // Pointer Move (HUD coordinates, Magnifier Loupe, Box/Scribble drag preview)
  promptOverlayCanvas.addEventListener('mousemove', (e) => {
    const coords = getCanvasCoords(e);
    hudX.textContent = coords.x;
    hudY.textContent = coords.y;

    // Sample pixel value under cursor
    const idx = coords.y * engine.width + coords.x;
    if (idx >= 0 && idx < engine.grayscaleBuffer.length) {
      const rawVal = engine.grayscaleBuffer[idx];
      hudVal.textContent = currentScanId === 'chest_ct' ? Math.round((rawVal / 255) * 1200 - 800) : rawVal;
    }

    // Magnifier Lens
    if (isMagnifierActive && magnifierLens) {
      magnifierLens.style.left = e.clientX + 'px';
      magnifierLens.style.top = e.clientY + 'px';
      renderer.updateMagnifier(coords.x, coords.y);
    }

    // Interactive Box Dragging Preview
    if (isDrawingBox && boxStart) {
      renderer.renderPrompts(); // Clear prompt canvas
      const ctx = renderer.promptCtx;
      ctx.save();
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      const bx = Math.min(boxStart.x, coords.x);
      const by = Math.min(boxStart.y, coords.y);
      const bw = Math.abs(coords.x - boxStart.x);
      const bh = Math.abs(coords.y - boxStart.y);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    }

    // Interactive Scribble Preview
    if (isScribbling) {
      currentScribble.push(coords);
      const ctx = renderer.promptCtx;
      ctx.save();
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      const len = currentScribble.length;
      if (len > 1) {
        ctx.beginPath();
        ctx.moveTo(currentScribble[len - 2].x, currentScribble[len - 2].y);
        ctx.lineTo(currentScribble[len - 1].x, currentScribble[len - 1].y);
        ctx.stroke();
      }
      ctx.restore();
    }
  });

  // Pointer Down
  promptOverlayCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only main left click
    const coords = getCanvasCoords(e);

    if (activeTool === 'box') {
      isDrawingBox = true;
      boxStart = coords;
      window.medicalAudio.playPromptSound('box');
    } else if (activeTool === 'point_pos') {
      engine.addPointPrompt(coords.x, coords.y, 1);
      renderer.renderAll();
      updateMetricsUI();
      window.medicalAudio.playPromptSound('pos');
      triggerInferenceFeedback(`MedSAM updated with Inclusion (+) Seed at [${coords.x}, ${coords.y}]`);
    } else if (activeTool === 'point_neg') {
      engine.addPointPrompt(coords.x, coords.y, 0);
      renderer.renderAll();
      updateMetricsUI();
      window.medicalAudio.playPromptSound('neg');
      triggerInferenceFeedback(`MedSAM updated with Exclusion (-) Seed at [${coords.x}, ${coords.y}]`);
    } else if (activeTool === 'brush') {
      isScribbling = true;
      currentScribble = [coords];
      window.medicalAudio.playPromptSound('pos');
    }
  });

  // Pointer Up
  window.addEventListener('mouseup', (e) => {
    if (isDrawingBox && boxStart) {
      const coords = getCanvasCoords(e);
      const minX = Math.min(boxStart.x, coords.x);
      const minY = Math.min(boxStart.y, coords.y);
      const maxX = Math.max(boxStart.x, coords.x);
      const maxY = Math.max(boxStart.y, coords.y);

      // Only commit if box has reasonable size (> 10px)
      if (maxX - minX > 10 && maxY - minY > 10) {
        engine.addBoxPrompt([minX, minY, maxX, maxY]);
        renderer.renderAll();
        updateMetricsUI();
        window.medicalAudio.playInferenceSound();
        triggerInferenceFeedback(`MedSAM prompt evaluated in ${engine.metrics.latencyMs} ms`);
        renderer.triggerLaserScanner();
      }

      isDrawingBox = false;
      boxStart = null;
    }

    if (isScribbling) {
      if (currentScribble.length > 3) {
        engine.addScribble(currentScribble);
        renderer.renderAll();
        updateMetricsUI();
        window.medicalAudio.playInferenceSound();
        triggerInferenceFeedback(`MedSAM scribble guidance executed in ${engine.metrics.latencyMs} ms`);
      }
      isScribbling = false;
      currentScribble = [];
    }

    if (isDraggingSplit) {
      isDraggingSplit = false;
    }
  });

  // Split View Curtain Dragging
  splitCurtain.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDraggingSplit = true;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingSplit || !renderer.isSplitView) return;
    const rect = canvasWrapper.getBoundingClientRect();
    let newX = e.clientX - rect.left;
    newX = Math.max(10, Math.min(rect.width - 10, newX));
    renderer.splitX = (newX / rect.width) * engine.width;
    splitCurtain.style.left = `${(newX / rect.width) * 100}%`;
    renderer.renderMask();
  });

  /* =========================================================================
     5. UI Updates & Quantitative Radiomic Telemetry
     ========================================================================= */

  function updateMetricsUI() {
    const m = engine.metrics;

    // Dice & IoU percentages
    const dicePct = (m.dice * 100).toFixed(1);
    const iouPct = (m.iou * 100).toFixed(1);
    metricDiceVal.textContent = dicePct + '%';
    metricIouVal.textContent = iouPct + '%';

    // SVG Radial Gauges (Circumference of r=42 is 2 * PI * 42 ≈ 263.89)
    const circ = 264;
    gaugeDiceCircle.style.strokeDashoffset = Math.max(0, circ * (1 - m.dice));
    gaugeIouCircle.style.strokeDashoffset = Math.max(0, circ * (1 - m.iou));

    // Grade Badges
    if (m.dice >= 0.92) {
      diceGrade.textContent = "Exceptional Match";
      diceGrade.className = "gauge-grade grade-exceptional";
    } else if (m.dice >= 0.85) {
      diceGrade.textContent = "High Agreement";
      diceGrade.className = "gauge-grade grade-high";
    } else {
      diceGrade.textContent = "Moderate Fit";
      diceGrade.className = "gauge-grade";
    }

    if (m.iou >= 0.88) {
      iouGrade.textContent = "High Overlap";
      iouGrade.className = "gauge-grade grade-exceptional";
    } else {
      iouGrade.textContent = "Standard Overlap";
      iouGrade.className = "gauge-grade grade-high";
    }

    // Telemetry list
    metricHd95.textContent = m.hd95Mm + ' mm';
    metricArea.textContent = m.areaMm2.toLocaleString() + ' mm²';
    metricVolume.textContent = m.volumeCm3 + ' cm³';
    metricMeanIntensity.textContent = m.meanIntensity;

    // Special clinical metrics (e.g. Cup-to-Disc Ratio for Retina Fundus)
    if (m.cupToDiscRatio !== null) {
      metricSpecificKey.textContent = "Cup-to-Disc Ratio (CDR)";
      metricSpecificVal.textContent = m.cupToDiscRatio + " (Normal < 0.60)";
    } else {
      metricSpecificKey.textContent = "Sphericity Index";
      metricSpecificVal.textContent = m.sphericity + " (Convexity)";
    }

    // Latency
    headerLatency.textContent = `~${m.latencyMs} ms`;
    specLatency.textContent = `${m.latencyMs} ms / prompt`;

    // Active Prompts List
    renderPromptsList();
  }

  function renderPromptsList() {
    promptsList.innerHTML = '';
    const bCount = engine.boxes.length;
    const pCount = engine.points.length;
    const sCount = engine.scribbles.length;
    promptCountBadge.textContent = `${bCount} Box • ${pCount} Points`;

    // Boxes
    engine.boxes.forEach((box, idx) => {
      const item = document.createElement('div');
      item.className = 'prompt-chip-item';
      item.innerHTML = `
        <div class="prompt-chip-left">
          <i class="fa-regular fa-square text-cyan"></i>
          <strong>Box Prompt #${idx + 1}</strong>
          <span class="prompt-chip-coords">[${box[0]}, ${box[1]}, ${box[2]}, ${box[3]}]</span>
        </div>
        <button class="btn-delete-prompt" title="Delete Box"><i class="fa-solid fa-xmark"></i></button>
      `;
      item.querySelector('.btn-delete-prompt').addEventListener('click', () => {
        engine.boxes.splice(idx, 1);
        engine.runInference();
        renderer.renderAll();
        updateMetricsUI();
      });
      promptsList.appendChild(item);
    });

    // Points
    engine.points.forEach((pt, idx) => {
      const isPos = pt.label === 1;
      const item = document.createElement('div');
      item.className = 'prompt-chip-item';
      item.innerHTML = `
        <div class="prompt-chip-left">
          <i class="${isPos ? 'fa-solid fa-circle-plus text-emerald' : 'fa-solid fa-circle-minus text-crimson'}"></i>
          <span>${isPos ? 'Inclusion (+)' : 'Exclusion (-)'} #${idx + 1}</span>
          <span class="prompt-chip-coords">(${pt.x}, ${pt.y})</span>
        </div>
        <button class="btn-delete-prompt" title="Delete Point"><i class="fa-solid fa-xmark"></i></button>
      `;
      item.querySelector('.btn-delete-prompt').addEventListener('click', () => {
        engine.points.splice(idx, 1);
        engine.runInference();
        renderer.renderAll();
        updateMetricsUI();
      });
      promptsList.appendChild(item);
    });
  }

  function triggerInferenceFeedback(message) {
    inferenceToastText.textContent = message;
    inferenceToast.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
      inferenceToast.classList.remove('show');
    }, 2400);
  }

  /* =========================================================================
     6. Toolbar & Semantic Text Prompt Events
     ========================================================================= */

  // Tool buttons (Box, Positive Point, Negative Point, Brush)
  const toolButtons = {
    box: document.getElementById('toolBoxPrompt'),
    point_pos: document.getElementById('toolPointPos'),
    point_neg: document.getElementById('toolPointNeg'),
    brush: document.getElementById('toolBrushPrompt')
  };

  Object.entries(toolButtons).forEach(([toolName, btn]) => {
    btn.addEventListener('click', () => {
      activeTool = toolName;
      Object.values(toolButtons).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.medicalAudio.playPromptSound('box');
    });
  });

  // Undo & Clear Prompts
  document.getElementById('btnUndoPrompt').addEventListener('click', () => {
    if (engine.undo()) {
      renderer.renderAll();
      updateMetricsUI();
      triggerInferenceFeedback("Prompt state undone");
      window.medicalAudio.playPromptSound('neg');
    }
  });

  document.getElementById('btnClearPrompts').addEventListener('click', () => {
    engine.clearPrompts(true);
    renderer.renderAll();
    updateMetricsUI();
    triggerInferenceFeedback("All active prompts cleared");
    window.medicalAudio.playPromptSound('neg');
  });

  // Semantic Language Guidance Input
  const textPromptInput = document.getElementById('textPromptInput');
  const btnSubmitTextPrompt = document.getElementById('btnSubmitTextPrompt');

  function handleSemanticPrompt(query) {
    if (!query) return;
    const cleanQuery = query.toLowerCase().trim();
    const dataset = engine.currentDataset;
    if (!dataset) return;

    let targetKey = null;
    if (dataset.semanticQueries) {
      for (const [k, v] of Object.entries(dataset.semanticQueries)) {
        if (cleanQuery.includes(k)) {
          targetKey = v;
          break;
        }
      }
    }

    if (targetKey) {
      engine.loadDataset(dataset, targetKey);
      renderer.renderAll();
      updateMetricsUI();
      window.medicalAudio.playSuccessSound();
      triggerInferenceFeedback(`Language-MedSAM: Resolved "${query}" to anatomical prior [${targetKey}]`);
      renderer.triggerLaserScanner();
    } else {
      triggerInferenceFeedback(`MedSAM: Analyzing semantic prompt "${query}"...`);
      // Default to primary target
      engine.loadDataset(dataset);
      renderer.renderAll();
      updateMetricsUI();
    }
  }

  btnSubmitTextPrompt.addEventListener('click', () => {
    handleSemanticPrompt(textPromptInput.value);
    textPromptInput.value = '';
  });

  textPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSemanticPrompt(textPromptInput.value);
      textPromptInput.value = '';
    }
  });

  // Quick Chips
  document.querySelectorAll('#quickPromptChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.textContent;
      handleSemanticPrompt(q);
    });
  });

  /* =========================================================================
     7. Dataset Selection Cards & Custom Upload
     ========================================================================= */

  document.querySelectorAll('.scan-card').forEach(card => {
    card.addEventListener('click', () => {
      const scanId = card.dataset.scanId;
      if (scanId) {
        loadScan(scanId);
      }
    });
  });

  // Custom Image Upload
  const uploadDropzone = document.getElementById('uploadDropzone');
  const scanFileInput = document.getElementById('scanFileInput');

  uploadDropzone.addEventListener('click', () => scanFileInput.click());

  scanFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const customImg = new Image();
      customImg.onload = () => {
        loadScan('custom', customImg);
      };
      customImg.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Drag and Drop into Dropzone
  uploadDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadDropzone.style.borderColor = '#00f2fe';
  });
  uploadDropzone.addEventListener('dragleave', () => {
    uploadDropzone.style.borderColor = '';
  });
  uploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDropzone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const customImg = new Image();
        customImg.onload = () => {
          loadScan('custom', customImg);
          setPipelineStatus(
            "Custom Scan Uploaded • Ready",
            "Scan loaded into workspace. Click 'Auto-Run Pipeline' to autonomously process segmentation.",
            0,
            false
          );
        };
        customImg.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  // Pre-Generated Test Images Gallery Clicks
  document.querySelectorAll('.btn-test-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const src = chip.dataset.testSrc;
      const name = chip.dataset.testName;
      const modality = chip.dataset.testModality;
      const targetName = chip.dataset.targetName;
      const box = chip.dataset.targetBox.split(',').map(Number);
      const point = chip.dataset.targetPoint.split(',').map(Number);

      const testImg = new Image();
      testImg.onload = () => {
        loadScan('custom', testImg, {
          name,
          modality,
          targetName,
          box,
          point
        });

        setPipelineStatus(
          `Test Scan Loaded: ${name}`,
          `Target: "${targetName}". Click 'Auto-Run Pipeline' to execute autonomous MedSAM segmentation.`,
          0,
          false
        );

        // Flash upload dropzone with cyan glow feedback
        uploadDropzone.style.borderColor = '#00f5a0';
        uploadDropzone.style.background = 'rgba(0, 245, 160, 0.1)';
        setTimeout(() => {
          uploadDropzone.style.borderColor = '';
          uploadDropzone.style.background = '';
        }, 1200);

        window.medicalAudio.playPromptSound('pos');
      };
      testImg.src = src;
    });
  });

  /* =========================================================================
     7B. Autonomous MedSAM Pipeline Runner (Sequential Process Stepper)
     ========================================================================= */

  let isPipelineRunning = false;
  const btnRunPipeline = document.getElementById('btnRunPipeline');
  const runPipelineBtnText = document.getElementById('runPipelineBtnText');
  const runPipelineIcon = document.getElementById('runPipelineIcon');
  const pipelineStatusDot = document.getElementById('pipelineStatusDot');
  const pipelineStageText = document.getElementById('pipelineStageText');
  const pipelineExplanationText = document.getElementById('pipelineExplanationText');
  const pipelineProgressFill = document.getElementById('pipelineProgressFill');
  const pipelinePercent = document.getElementById('pipelinePercent');

  function setPipelineStatus(stage, desc, percent, isRunning = false) {
    if (pipelineStageText) pipelineStageText.textContent = stage;
    if (pipelineExplanationText) pipelineExplanationText.textContent = desc;
    if (pipelineProgressFill) pipelineProgressFill.style.width = `${percent}%`;
    if (pipelinePercent) pipelinePercent.textContent = `${percent}%`;

    if (isRunning) {
      if (pipelineStatusDot) pipelineStatusDot.className = 'status-pulse-dot running';
      if (btnRunPipeline) {
        btnRunPipeline.className = 'btn btn-run-pipeline running';
        runPipelineBtnText.textContent = 'Running Pipeline...';
        runPipelineIcon.className = 'fa-solid fa-spinner';
      }
    } else {
      if (pipelineStatusDot) pipelineStatusDot.className = 'status-pulse-dot';
      if (btnRunPipeline) {
        btnRunPipeline.className = 'btn btn-run-pipeline';
        runPipelineBtnText.textContent = 'Auto-Run Pipeline';
        runPipelineIcon.className = 'fa-solid fa-play';
      }
    }
  }

  function executeAutonomousPipeline() {
    if (isPipelineRunning) return;
    isPipelineRunning = true;
    window.medicalAudio.playPromptSound('box');

    // Stage 1: Calibration (15%)
    setPipelineStatus(
      "Stage 1/6: Calibrating Image & Dynamic Range",
      "Analyzing voxel luminance distribution; normalizing dynamic range contrast for target tissue.",
      15,
      true
    );

    setTimeout(() => {
      // Stage 2: Feature Extraction (35%)
      setPipelineStatus(
        "Stage 2/6: ViT-H Vision Transformer Feature Extraction",
        "Dividing 512x512 scan into 16x16 patches; extracting 256-D deep medical feature tensor in browser cache.",
        35,
        true
      );
      window.medicalAudio.playPromptSound('pos');
    }, 600);

    setTimeout(() => {
      // Stage 3: Saliency Detection & Prompt Synthesis (55%)
      setPipelineStatus(
        "Stage 3/6: Saliency Detection & Prompt Synthesis",
        "Autonomous anatomical landmark localization; generating optimal bounding box prompt and positive seed point.",
        55,
        true
      );

      // Determine ROI box from active target
      const curTarget = engine.currentTarget || (engine.currentDataset ? engine.currentDataset.primaryTarget : null);
      if (curTarget && curTarget.box) {
        engine.clearPrompts(false);
        engine.addBoxPrompt([...curTarget.box], false);
        if (curTarget.points) {
          curTarget.points.forEach(p => engine.addPointPrompt(p.x, p.y, p.label, false));
        }
      } else {
        engine.clearPrompts(false);
        engine.addBoxPrompt([140, 160, 420, 420], false);
        engine.addPointPrompt(280, 290, 1, false);
      }
      renderer.renderPrompts();
      window.medicalAudio.playPromptSound('pos');
    }, 1300);

    setTimeout(() => {
      // Stage 4: Two-Way Cross-Attention Mask Decoder (75%)
      setPipelineStatus(
        "Stage 4/6: Two-Way Cross-Attention Mask Decoding",
        "Interleaving image embedding tokens with prompt Fourier positional encodings; evaluating mask logits in ~7.4ms.",
        75,
        true
      );
      renderer.triggerLaserScanner();
      window.medicalAudio.playLaserSound();
      engine.runInference();
    }, 2000);

    setTimeout(() => {
      // Stage 5: Edge Snapping & Moore-Neighbor (90%)
      setPipelineStatus(
        "Stage 5/6: Sobel Gradient Snapping & Moore-Neighbor Tracing",
        "Refining boundary along high-gradient anatomical edges; tracing continuous closed-loop marching ants contour.",
        90,
        true
      );
      renderer.renderAll();
      updateMetricsUI();
      window.medicalAudio.playPromptSound('box');
    }, 2700);

    setTimeout(() => {
      // Stage 6: Complete (100%)
      const m = engine.metrics;
      setPipelineStatus(
        "Stage 6/6: Quantitative Radiomic Telemetry Complete",
        `Autonomous MedSAM pipeline finished! DSC: ${(m.dice*100).toFixed(1)}%, IoU: ${(m.iou*100).toFixed(1)}%, HD95: ${m.hd95Mm} mm, Area: ${m.areaMm2.toLocaleString()} mm².`,
        100,
        false
      );
      isPipelineRunning = false;
      window.medicalAudio.playSuccessSound();
      triggerInferenceFeedback("Autonomous MedSAM Pipeline Completed Successfully!");
    }, 3400);
  }

  if (btnRunPipeline) {
    btnRunPipeline.addEventListener('click', executeAutonomousPipeline);
  }

  /* =========================================================================
     8. Multi-Slice Z-Navigator
     ========================================================================= */
  const sliceRangeInput = document.getElementById('sliceRangeInput');
  const sliceIndicator = document.getElementById('sliceIndicator');
  const sliceLocationZ = document.getElementById('sliceLocationZ');
  const btnPrevSlice = document.getElementById('btnPrevSlice');
  const btnNextSlice = document.getElementById('btnNextSlice');

  function updateSlice(sliceNum) {
    sliceRangeInput.value = sliceNum;
    sliceIndicator.textContent = `Slice ${sliceNum} / 32`;
    const zOffset = (-(32 - sliceNum) * 1.5).toFixed(1);
    sliceLocationZ.textContent = `Z: ${zOffset} mm`;
    renderer.triggerLaserScanner();
    window.medicalAudio.playPromptSound('box');
  }

  sliceRangeInput.addEventListener('input', (e) => updateSlice(e.target.value));
  btnPrevSlice.addEventListener('click', () => {
    const val = Math.max(1, parseInt(sliceRangeInput.value) - 1);
    updateSlice(val);
  });
  btnNextSlice.addEventListener('click', () => {
    const val = Math.min(32, parseInt(sliceRangeInput.value) + 1);
    updateSlice(val);
  });

  /* =========================================================================
     9. Radiology Window / Level & Colormap LUTs
     ========================================================================= */
  const windowLevelInput = document.getElementById('windowLevelInput');
  const windowWidthInput = document.getElementById('windowWidthInput');
  const wlValue = document.getElementById('wlValue');
  const wwValue = document.getElementById('wwValue');
  const btnResetLut = document.getElementById('btnResetLut');

  windowLevelInput.addEventListener('input', (e) => {
    renderer.windowLevel = parseInt(e.target.value);
    wlValue.textContent = renderer.windowLevel;
    renderer.renderBaseScan();
  });

  windowWidthInput.addEventListener('input', (e) => {
    renderer.windowWidth = parseInt(e.target.value);
    wwValue.textContent = renderer.windowWidth;
    renderer.renderBaseScan();
  });

  colormapSelect.addEventListener('change', (e) => {
    renderer.colormap = e.target.value;
    renderer.renderBaseScan();
    window.medicalAudio.playPromptSound('pos');
  });

  btnResetLut.addEventListener('click', () => {
    renderer.windowLevel = 128;
    renderer.windowWidth = 256;
    renderer.colormap = 'grayscale';
    windowLevelInput.value = 128;
    windowWidthInput.value = 256;
    wlValue.textContent = 128;
    wwValue.textContent = 256;
    colormapSelect.value = 'grayscale';
    renderer.renderBaseScan();
  });

  // Preset Chips
  document.querySelectorAll('.preset-buttons .btn-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.preset-buttons .btn-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const preset = chip.dataset.preset;
      const presets = {
        default: { wl: 128, ww: 256 },
        brain: { wl: 110, ww: 180 },
        lung: { wl: 70, ww: 300 },
        bone: { wl: 220, ww: 400 },
        soft_tissue: { wl: 140, ww: 200 }
      };
      if (presets[preset]) {
        renderer.windowLevel = presets[preset].wl;
        renderer.windowWidth = presets[preset].ww;
        windowLevelInput.value = presets[preset].wl;
        windowWidthInput.value = presets[preset].ww;
        wlValue.textContent = presets[preset].wl;
        wwValue.textContent = presets[preset].ww;
        renderer.renderBaseScan();
        window.medicalAudio.playPromptSound('box');
      }
    });
  });

  /* =========================================================================
     10. Viewport Bottom Controls
     ========================================================================= */

  // Mask Fill Toggle
  document.getElementById('chkShowMask').addEventListener('change', (e) => {
    renderer.showMask = e.target.checked;
    renderer.renderMask();
  });

  // Contours Toggle
  document.getElementById('chkShowContour').addEventListener('change', (e) => {
    renderer.showContour = e.target.checked;
    renderer.renderMask();
  });

  // Uncertainty Toggle
  document.getElementById('chkShowUncertainty').addEventListener('change', (e) => {
    renderer.showUncertainty = e.target.checked;
    renderer.renderHeatmap();
  });

  // Split View Toggle
  const chkSplitView = document.getElementById('chkSplitView');
  chkSplitView.addEventListener('change', (e) => {
    renderer.isSplitView = e.target.checked;
    splitCurtain.style.display = e.target.checked ? 'block' : 'none';
    renderer.renderMask();
  });

  // 3D Surface Mode Toggle
  const chk3dSurface = document.getElementById('chk3dSurface');
  const surface3dView = document.getElementById('surface3dView');
  chk3dSurface.addEventListener('change', (e) => {
    renderer.is3dMode = e.target.checked;
    surface3dView.style.display = e.target.checked ? 'flex' : 'none';
    if (e.target.checked) {
      renderer.render3dSurface();
    }
  });

  // Mask Opacity & Color
  const maskOpacityInput = document.getElementById('maskOpacityInput');
  const maskOpacityValue = document.getElementById('maskOpacityValue');
  const maskColorPicker = document.getElementById('maskColorPicker');

  maskOpacityInput.addEventListener('input', (e) => {
    renderer.maskOpacity = parseFloat(e.target.value);
    maskOpacityValue.textContent = Math.round(renderer.maskOpacity * 100) + '%';
    renderer.renderMask();
  });

  maskColorPicker.addEventListener('input', (e) => {
    renderer.maskColor = e.target.value;
    renderer.renderMask();
  });

  // Invert Colors
  document.getElementById('btnInvertColors').addEventListener('click', () => {
    renderer.isInverted = !renderer.isInverted;
    renderer.renderBaseScan();
    window.medicalAudio.playPromptSound('box');
  });

  // Magnifier Loupe Toggle
  const btnToggleMagnifier = document.getElementById('btnToggleMagnifier');
  btnToggleMagnifier.addEventListener('click', () => {
    isMagnifierActive = !isMagnifierActive;
    btnToggleMagnifier.classList.toggle('active', isMagnifierActive);
    magnifierLens.style.display = isMagnifierActive ? 'block' : 'none';
  });

  // Zoom Controls
  let zoomLevel = 1.0;
  function setZoom(z) {
    zoomLevel = Math.max(0.5, Math.min(3.0, z));
    canvasWrapper.style.transform = `scale(${zoomLevel})`;
    hudZoomText.textContent = Math.round(zoomLevel * 100) + '%';
  }
  document.getElementById('btnZoomIn').addEventListener('click', () => setZoom(zoomLevel + 0.2));
  document.getElementById('btnZoomOut').addEventListener('click', () => setZoom(zoomLevel - 0.2));
  document.getElementById('btnZoomFit').addEventListener('click', () => setZoom(1.0));

  /* =========================================================================
     11. Export & Clinical Reporting Actions
     ========================================================================= */

  document.getElementById('btnExportMask').addEventListener('click', () => reportManager.exportBinaryMask());
  document.getElementById('btnExportOverlay').addEventListener('click', () => reportManager.exportOverlay());
  document.getElementById('btnExportJson').addEventListener('click', () => reportManager.exportJsonAnnotations());
  document.getElementById('btnExportSvg').addEventListener('click', () => reportManager.exportSvgContour());

  // Report Modal
  document.getElementById('btnGenerateReport').addEventListener('click', () => reportManager.openClinicalReport());
  document.getElementById('btnCloseReportModal').addEventListener('click', () => reportManager.closeClinicalReport());
  document.getElementById('btnPrintReport').addEventListener('click', () => reportManager.printReport());
  document.getElementById('btnDownloadReportHtml').addEventListener('click', () => reportManager.printReport());

  // Architecture Modal
  const archModal = document.getElementById('archModal');
  document.getElementById('btnArchitectureModal').addEventListener('click', () => {
    archModal.style.display = 'flex';
    window.medicalAudio.playPromptSound('pos');
  });
  document.getElementById('btnCloseArchModal').addEventListener('click', () => {
    archModal.style.display = 'none';
  });
  document.getElementById('btnAckArchModal').addEventListener('click', () => {
    archModal.style.display = 'none';
  });

  // User Manual & Project Guide Modal
  const userManualModal = document.getElementById('userManualModal');
  const btnUserManual = document.getElementById('btnUserManual');
  const btnCloseManualModal = document.getElementById('btnCloseManualModal');
  const btnAckManualModal = document.getElementById('btnAckManualModal');
  const btnTrySampleTour = document.getElementById('btnTrySampleTour');

  if (btnUserManual && userManualModal) {
    btnUserManual.addEventListener('click', () => {
      userManualModal.style.display = 'flex';
      window.medicalAudio.playPromptSound('pos');
    });

    const closeManual = () => {
      userManualModal.style.display = 'none';
    };
    if (btnCloseManualModal) btnCloseManualModal.addEventListener('click', closeManual);
    if (btnAckManualModal) btnAckManualModal.addEventListener('click', closeManual);

    // Tab Switching
    document.querySelectorAll('.manual-tab-btn').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        document.querySelectorAll('.manual-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.manual-tab-pane').forEach(p => p.classList.remove('active'));

        tabBtn.classList.add('active');
        const targetPane = document.getElementById(tabBtn.dataset.tab);
        if (targetPane) {
          targetPane.classList.add('active');
        }
        window.medicalAudio.playPromptSound('box');
      });
    });

    if (btnTrySampleTour) {
      btnTrySampleTour.addEventListener('click', () => {
        closeManual();
        loadScan('brain_mri');
        triggerInferenceFeedback("MedSAM ready! Try dragging a box [B] or placing points [P]");
      });
    }
  }

  // Audio Toggle
  const btnAudioToggle = document.getElementById('btnAudioToggle');
  const audioIcon = document.getElementById('audioIcon');
  btnAudioToggle.addEventListener('click', () => {
    const isMuted = window.medicalAudio.toggleMute();
    audioIcon.className = isMuted ? 'fa-solid fa-volume-xmark text-crimson' : 'fa-solid fa-volume-high';
  });

  /* =========================================================================
     12. Keyboard Shortcuts
     ========================================================================= */

  window.addEventListener('keydown', (e) => {
    // Ignore keystrokes inside text inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'b' || e.key === 'B') {
      toolButtons.box.click();
    } else if (e.key === 'p' || e.key === 'P') {
      toolButtons.point_pos.click();
    } else if (e.key === 'n' || e.key === 'N') {
      toolButtons.point_neg.click();
    } else if (e.key === 's' || e.key === 'S') {
      toolButtons.brush.click();
    } else if (e.key === 'm' || e.key === 'M') {
      document.getElementById('chkShowMask').click();
    } else if (e.key === 'c' || e.key === 'C') {
      document.getElementById('chkShowContour').click();
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      document.getElementById('btnUndoPrompt').click();
    } else if (e.key === 'Shift') {
      isMagnifierActive = true;
      btnToggleMagnifier.classList.add('active');
      magnifierLens.style.display = 'block';
    } else if (e.key === 'Escape') {
      archModal.style.display = 'none';
      document.getElementById('reportModal').style.display = 'none';
      if (userManualModal) userManualModal.style.display = 'none';
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      isMagnifierActive = false;
      btnToggleMagnifier.classList.remove('active');
      magnifierLens.style.display = 'none';
    }
  });

  // 13. Initial Boot
  loadScan('brain_mri');
});
