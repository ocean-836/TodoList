use std::sync::Mutex;
use tauri::{LogicalPosition, LogicalSize, WebviewWindow};

struct WidgetState(Mutex<Option<(LogicalSize<f64>, LogicalPosition<f64>)>>);

/// 收起：把整个窗口缩成一个小圆窗（悬浮球），置顶并隐藏任务栏图标
#[tauri::command]
fn enter_widget(window: WebviewWindow, state: tauri::State<'_, WidgetState>) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let inner = window.inner_size().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some((
        inner.to_logical::<f64>(scale),
        position.to_logical::<f64>(scale),
    ));

    let size = LogicalSize::new(96.0, 96.0);
    window.set_size(size).map_err(|e| e.to_string())?;
    // 关掉系统窗口投影，否则透明小窗外面会显出一圈方形阴影
    window.set_shadow(false).map_err(|e| e.to_string())?;

    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let monitor_scale = monitor.scale_factor();
        let area = monitor.size().to_logical::<f64>(monitor_scale);
        let origin = monitor.position().to_logical::<f64>(monitor_scale);
        let x = origin.x + area.width - size.width - 24.0;
        let y = origin.y + area.height - size.height - 24.0;
        window
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
    }

    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
    Ok(())
}

/// 展开：恢复窗口尺寸与位置，取消置顶
#[tauri::command]
fn exit_widget(window: WebviewWindow, state: tauri::State<'_, WidgetState>) -> Result<(), String> {
    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window.set_skip_taskbar(false).map_err(|e| e.to_string())?;
    window.set_shadow(true).map_err(|e| e.to_string())?;

    if let Some((size, position)) = state.0.lock().unwrap().take() {
        window.set_size(size).map_err(|e| e.to_string())?;
        window.set_position(position).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 退出程序（关闭按钮用）
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// 开始拖动窗口（标题栏区域按下时调用）
#[tauri::command]
fn begin_drag(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// 拖拽缩放：直接把窗口摆到新的位置和尺寸
#[tauri::command]
fn set_window_frame(window: WebviewWindow, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WidgetState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            enter_widget,
            exit_widget,
            quit_app,
            begin_drag,
            set_window_frame
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
