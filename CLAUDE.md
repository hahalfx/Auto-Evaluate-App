# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **desktop automation testing application** for evaluating car voice assistant response quality, built with Tauri (Rust) and Next.js. The system manages test tasks, samples, and provides automated testing workflows for wake word detection and voice command response analysis.

## Key Development Commands

### Development
- `npm run tauri dev` - Start full development environment (Next.js + Tauri backend)
- `npm run dev` - Start only Next.js frontend (port 3000)
- `npm run build` - Build Next.js frontend for production
- `npm run tauri build` - Build full Tauri desktop application

### Code Quality
- `npm run lint` - Run ESLint for Next.js frontend
- `npm run start` - Start Next.js production server

### Rust Backend (Tauri)
- Commands are defined in `src-tauri/src/commands.rs`
- Models in `src-tauri/src/models.rs`
- Database operations in `src-tauri/src/db/database.rs`
- Core services in `src-tauri/src/services/`

## Architecture Overview

### Frontend (Next.js 15.2.4)
- **Framework**: Next.js with App Router
- **UI**: Shadcn UI, Radix UI, Tailwind CSS
- **State**: Redux Toolkit
- **Routing**: `/llm-analysis`, `/taskmanage`, `/casemanage`, `/settings`, `/wake-detection-workflow`
- **Components**: Dashboard, Task Management, Test Samples, Wake Word Management, Wake Detection Workflow

### Backend (Tauri v2 + Rust)
- **Database**: SQLite with SQLx
- **Async Runtime**: Tokio
- **Audio**: Rodio for playback, CPAL for audio capture
- **OCR**: Tesseract for image processing with engine pooling
- **ASR**: iFlytek Xunfei API integration via WebSocket
- **Vision**: OpenCV for visual wake detection

## Workflow System Architecture

### Core Components

#### 1. Workflow Engine (`workflow.rs`)
- **Task Trait**: Unified interface for all executable units
- **Control Signals**: Running/Paused/Stopped states with real-time control
- **Dependency Management**: Directed acyclic graph (DAG) execution with topological sorting
- **Context Sharing**: Type-safe shared state between tasks via `WorkflowContext`

#### 2. Visual Wake Detection System

**Core Engine (`visual_wake_detection.rs`):**
- **OpenCV Template Matching**: Multi-scale matching with scales [1.0, 0.8, 0.6, 0.4, 0.3, 0.2]
- **Global Singleton**: `Arc<Mutex<VisualWakeDetector>>` for single instance across app
- **Real-time Control**: `set_enabled(true/false)` for instant start/stop
- **Confidence Scoring**: Returns `Option<f64>` with configurable threshold (default 0.5)
- **ROI Support**: Region of interest selection with automatic frame cropping

**Backend APIs (`commands.rs`):**
- `start_visual_wake_detection_with_data(template_data, roi)` - Accepts Base64 templates
- `stop_visual_wake_detection()` - Disables detector via `set_enabled(false)`
- `calibrate_visual_detection(frame_data)` - Dynamic threshold adjustment
- `push_video_frame_visual(image_data)` - Real-time frame processing
- `save_template_image(filename, base64_data)` - Persistent template storage
- `get_templates_from_folder()` - Gallery-style template browsing

**Frontend Integration (`visual-wake-detection.tsx`):**
- **Real-time Video**: WebRTC camera access with configurable FPS (1-30 FPS)
- **Template Management**: Upload, capture, gallery selection from `public/templates/`
- **ROI Selection**: Interactive canvas overlay with mouse events
- **Event System**: Real-time updates via Tauri events
  - `visual_wake_event` - Detection results with confidence scores
  - `visual_wake_status` - Task state changes (started/stopped/paused/calibrated)
  - `task_completed` - Workflow completion signal

**Control Flow Sequence:**
```
Frontend: invoke('start_visual_wake_detection_with_data') →
Backend: load_templates_from_base64() → set_enabled(true) → emit('started') →
Frontend: start_frame_streaming() → invoke('push_video_frame_visual') →
Backend: perform_visual_wake_detection() → detect_wake_event() →
Backend: emit('visual_wake_event') + emit('task_completed') →
Frontend: update UI + stop streaming
```

#### 3. Sub-Tasks (Atomic Operations)

**Audio Tasks:**
- **`audio_task`**: Plays audio files (wake words, voice commands) with timing tracking
- **Integration**: Uses Rodio for synchronous playback within async context

**Vision Tasks:**
- **`active_task`**: Visual wake detection workflow wrapper
- **Features**: Configurable ROI, timeout detection (30s default), confidence scoring
- **Output**: Detection status and timing data to workflow context

**ASR Tasks:**
- **`asr_task`**: Real-time speech recognition via iFlytek Xunfei API
- **Process**: Audio capture → WebSocket streaming → result decoding
- **Integration**: Checks `active_task` timeout to skip processing when wake detection fails

**OCR Tasks:**
- **`ocr_task`**: Visual text recognition for car display analysis
- **Engine**: Tesseract with 6-engine pool for concurrent processing
- **Stability**: Text stabilization detection with configurable thresholds
- **Features**: Real-time FPS monitoring, error handling, graceful shutdown
- **Communication**: Detailed command-event flow (see OCR Communication Protocol below)

#### 4. Meta Task Executors (High-Level Workflows)

**Complete Test Workflow (`meta_task_executor`):**
```
唤醒词播放 → 语音指令播放 → 视觉唤醒检测 → 中间等待 → 
OCR识别 → ASR识别 → 大模型分析 → 结果保存
```

**Wake Detection Only (`wake_detection_meta_executor`):**
```
唤醒词播放 → 视觉唤醒检测 → 结果统计
```

**Key Distinction:**
- **meta_task_executor.rs**: 唤醒检测+车机指令识别检测+车机交互测评工作流 (Complete testing workflow including wake detection, voice command recognition, and car system interaction evaluation)
- **wake_detection_meta_executor.rs**: 只是唤醒检测工作流 (Wake detection only workflow - simplified version without voice command processing)

**Task Dependencies:**
- **Sequential**: Audio playback → Detection → Recognition → Analysis
- **Parallel**: OCR and ASR can run concurrently after detection
- **Conditional**: Tasks skip execution if upstream timeout detected

### Core Data Models
- **Task**: Test configurations with wake words, samples, and settings
- **Sample**: Test audio/text samples for voice commands
- **WakeWord**: Wake word configurations with associated audio
- **AnalysisResult**: Test results and evaluation data
- **WakeDetectionResult**: Wake word detection success/failure metrics
- **TimingData**: Precise timing for audio playback and response analysis

## Key Directories

- `/app/` - Next.js pages and API routes
- `/components/` - React components (dashboard, forms, UI elements)
- `/hooks/` - Custom React hooks for Tauri integration
- `/services/` - Tauri API wrappers for frontend
- `/src-tauri/src/` - Rust backend code
- `/store/` - Redux Toolkit slices for state management

## Testing Workflows

1. **Task Creation**: Configure test tasks with wake words and samples
2. **Sample Management**: Import audio/text samples for testing
3. **Automated Testing**: Execute sequential wake word → command → analysis cycles
4. **Result Analysis**: Process and visualize test outcomes

## Environment Setup

Requirements:
- Node.js v18+
- Rust v1.77+ (with Cargo)
- Tauri CLI: `cargo install tauri-cli`

For macOS development, additional permissions may be required for audio recording and file system access.

## OCR Communication Protocol

### Overview
The OCR system implements a sophisticated command-event based communication protocol between frontend (React) and backend (Rust) for real-time text recognition from video streams.

### Signal Flow Architecture

#### 1. Initialization Phase
```
Frontend: start_ocr_session(channel) →
Backend: Registers communication channel →
Backend: emit('ocr_task_event', {type: "start", ...}) →
Backend: emit('ocr_task_event', {type: "ready", ...}) →
Frontend: Begin frame streaming
```

#### 2. Processing Phase
```
Frontend: push_video_frame(image_data, timestamp) →
Backend: Queue frame → OCR processing →
Backend: emit('ocr_task_event', {type: "data", results: [...]}) →
Frontend: Update display
```

#### 3. Completion Phase
```
Backend: Text stabilization detected →
Backend: emit('ocr_task_event', {type: "session_complete", ...}) →
Backend: emit('ocr_task_event', {type: "stop", ...}) →
Frontend: Stop streaming and display final results
```

### Command Specifications

#### Frontend → Backend Commands

**`start_ocr_session(channel: Channel)`**
- **Purpose**: Initialize OCR session and register communication channel
- **Trigger**: User clicks "Start OCR" in UI
- **Backend Actions**:
  - Initialize 6 Tesseract engines with Chinese language support
  - Create frame processing queue (100 frames buffer)
  - Register event channel for real-time updates
- **Response**: None (asynchronous via events)

**`push_video_frame(image_data: Vec<u8>, timestamp: u64, width: u32, height: u32)`**
- **Purpose**: Send video frame for OCR processing
- **Trigger**: Real-time video capture (configurable FPS: 1-30)
- **Processing**: Concurrent processing with semaphore-based throttling
- **Response**: Result via event system

**`stop_ocr_session()`**
- **Purpose**: Gracefully shutdown OCR session
- **Trigger**: User action or session completion
- **Backend Actions**:
  - Stop frame processing
  - Cleanup OCR engines
  - Reset session state
- **Response**: Final statistics via stop event

#### Backend → Frontend Events

**`ocr_task_event` (Structured JSON)**
```typescript
interface OcrTaskEvent {
  type: "start" | "ready" | "stop" | "session_complete" | "error" | "warning"
  task_id: string
  timestamp: number
  message: string
  reason?: string
  processed_frames?: number
  error?: string
  consecutive_errors?: number
}
```

**`ocr_event` (Legacy String)**
- **Values**: `"start"` | `"stop"` | `"error"` | `"resume"`
- **Usage**: Backward compatibility with older components
- **Deprecating**: Migrate to `ocr_task_event`

### Detailed Signal Flow

#### Phase 1: Task Initialization
1. **Frontend**: `start_ocr_session()` - Registers WebRTC channel
2. **Backend**: 
   - Initialize 6 Tesseract engines with Chinese language support
   - Create frame processing queue (100 frames buffer)
   - Emit: `{type: "start", message: "OCR task initializing"}`
3. **Backend**: 
   - Complete initialization
   - Emit: `{type: "ready", message: "OCR task ready for frames"}`

#### Phase 2: Active Processing
1. **Frontend**: Continuous `push_video_frame()` calls
2. **Backend Processing Pipeline**:
   - Frame validation and preprocessing
   - Concurrent OCR with semaphore (max 6 concurrent)
   - Text stability analysis using Levenshtein distance
   - Real-time FPS monitoring
3. **Backend Events**:
   - `{type: "data", results: [...]}` - Individual frame results
   - `{type: "warning", message: "High error rate detected"}` - Quality alerts

#### Phase 3: Text Stabilization
1. **Stability Detection**:
   - 30-frame moving window analysis
   - 95% similarity threshold using edit distance
   - 5-second timeout for empty text scenarios
2. **Stabilization Event**:
   - Emit: `{type: "session_complete", final_text: "..."}`
   - Set `should_stop_ocr: true` in session state

#### Phase 4: Task Completion
1. **Graceful Shutdown**:
   - Emit: `{type: "stop", reason: "completed", processed_frames: N}`
   - Cleanup OCR engine pool
   - Reset session manager state

### Error Handling Signals

#### Consecutive Error Threshold
- **Trigger**: 5 consecutive processing failures
- **Action**: Automatic task termination
- **Event**: `{type: "error", consecutive_errors: 5}`

#### Communication Failures
- **Channel Closed**: Task termination with `{type: "stop", reason: "channel_closed"}`
- **Timeout Errors**: Frame processing timeout alerts
- **Resource Errors**: OCR engine initialization failures

### ROI Coordinate System

#### Coordinate Transformation
```typescript
// Display coordinates (CSS pixels) → Video coordinates (actual pixels)
const scaleX = video.videoWidth / videoDisplayWidth;
const scaleY = video.videoHeight / videoDisplayHeight;
const videoX = Math.round(displayX * scaleX);
```

#### Dual ROI Support
- **OCR ROI**: Green rectangle for text recognition
- **Visual Detection ROI**: Cyan rectangle for wake word detection
- **Independent Management**: Separate ROI states and clearing mechanisms

### Performance Monitoring

#### Real-time Metrics
- **Processing FPS**: Calculated every 1 second via monitoring task
- **Queue Length**: Frame buffer utilization tracking
- **Error Rate**: Consecutive failure counting
- **Latency**: End-to-end processing time measurement

#### Optimization Features
- **Frame Dropping**: Timeout-based dropping when queue is full (75ms threshold)
- **Adaptive Rate**: Frontend adjusts capture rate based on processing speed
- **Resource Cleanup**: Automatic engine shutdown on task completion

### Frontend State Management

#### React State Transitions
```typescript
// State machine for OCR processing
const ocrStates = {
  idle: "未启动",
  initializing: "start事件",
  ready: "ready事件", 
  processing: "持续推送帧",
  stabilizing: "文本稳定检测",
  completed: "session_complete事件",
  error: "error事件"
};
```

#### UI Feedback Loop
- **Toast Notifications**: Real-time user feedback for each state transition
- **Progress Indicators**: FPS counter and processing status
- **Error Display**: Detailed error messages with retry options

## File Mapping

- **meta_task_executor.rs** (Rust backend) ↔ **llm_analysis_interface.tsx** (React frontend)
- **wake_detection_meta_executor.rs** (Rust backend) ↔ **wake-detection-workflow.tsx** (React frontend)

## Key React Components and Their Functions

### Main Interface Components
- **llm_analysis_interface.tsx**: Main analysis interface that integrates OCR and progress tracking
- **ocr.tsx**: Primary OCR and visual wake detection component with dual ROI support
- **visual-wake-detection.tsx**: Dedicated visual wake detection interface with template management
- **wake-detection-workflow.tsx**: Complete workflow management for wake detection testing

### Supporting Components
- **progress-bar.tsx**: Progress tracking and control panel for automated testing
- **taskmanage.tsx**: Task creation and management interface
- **test-samples.tsx**: Sample audio/text management
- **wake-word.tsx**: Wake word configuration
- **template-manager.tsx**: Template file management for visual detection

## Tauri Command Structure

### Core Commands
- **Task Management**: `get_all_tasks`, `create_task`, `delete_task`, `set_current_task`
- **Sample Management**: `get_all_samples`, `create_sample`, `delete_sample`
- **Wake Word Management**: `get_all_wake_words`, `create_wake_word`, `delete_wake_word`
- **Workflow Control**: `start_automated_test`, `stop_testing`, `pause_workflow`, `resume_workflow`

### Vision/Audio Processing
- **OCR Commands**: `start_ocr_session`, `push_video_frame`, `stop_ocr_session`
- **Visual Detection**: `start_visual_wake_detection_with_data`, `push_video_frame_visual`, `stop_visual_wake_detection`
- **Audio Playback**: `play_audio`, `play_match_audio`

### Data Access
- **Results**: `get_analysis_results`, `get_machine_responses`, `get_wake_detection_results`
- **Configuration**: `get_timing_data_by_task`, `get_current_task`

## Testing and Debugging

### Event Monitoring
- Watch Tauri events: `visual_wake_event`, `ocr_task_event`, `task_completed`
- Monitor task progress through Redux state
- Check console logs for detailed operation information

### Performance Profiling
- Monitor frame processing times in OCR tasks
- Track memory usage in Rust backend
- Profile audio playback performance