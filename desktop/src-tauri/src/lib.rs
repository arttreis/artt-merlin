// merlin · o app de desktop
//
// uma casca, e nao uma copia: as duas janelas abrem o site publicado
// (merlin.arttreis.com.br). e o que deixa o login funcionar sem mudar nada —
// o cookie de sessao e SameSite=Lax e so vale no mesmo dominio do site
// (server/README.md); dentro de um app com o site empacotado ele seria de
// terceiro e nao grudaria. de quebra, o que sai num deploy aparece aqui sem
// reinstalar.
//
// o que so o app tem mora neste arquivo:
//   - o rastreador: uma janela pequena, sempre por cima, com tracker.html —
//     em repouso uma faixa, aberta um cartao; a altura e a pagina que diz
//     (fit_tracker);
//   - a bandeja, que repete o numero grande no tooltip (set_status);
//   - Alt+Shift+M de qualquer lugar do sistema, para abrir o rastreador
//     com o cursor no campo;
//   - fechar a janela grande esconde, nao sai — quem sai e o "Sair" da bandeja.
//
// MERLIN_URL troca o endereco (ex.: http://localhost:8787 com o `npm run dev`
// do server/). a capability "remote" so deixa o site falar com o app nos
// enderecos que ela lista.

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::StateFlags;

const DEFAULT_URL: &str = "https://merlin.arttreis.com.br";
const TRAY: &str = "merlin";
// o argumento com que o sistema abre o app no login: entra so o rastreador,
// a janela grande espera ser chamada
const BACKGROUND: &str = "--background";
const TRACKER_W: f64 = 380.0;
// a altura da faixa recolhida, que e como o rastreador nasce. dali em diante
// quem manda na altura e a pagina (fit_tracker): ela mede o que desenhou.
const TRACKER_H: f64 = 48.0;

#[cfg(target_os = "macos")]
const AUTOSTART_LABEL: &str = "Abrir ao iniciar a sessão";
#[cfg(not(target_os = "macos"))]
const AUTOSTART_LABEL: &str = "Abrir com o Windows";

fn base() -> Url {
    std::env::var("MERLIN_URL")
        .ok()
        .and_then(|raw| Url::parse(raw.trim()).ok())
        .unwrap_or_else(|| Url::parse(DEFAULT_URL).expect("o endereco padrao e uma URL"))
}

fn page(path: &str) -> Url {
    let b = base();
    b.join(path.trim_start_matches('/')).unwrap_or(b)
}

// ---------- o que o site pode pedir (src/shared/desktop.js) ----------

/// o tooltip da bandeja; no Mac, o numero tambem aparece ao lado do icone
#[tauri::command]
fn set_status(app: AppHandle, text: String) {
    let Some(tray) = app.tray_by_id(TRAY) else { return };
    // o Windows corta o tooltip em 127 caracteres, e corta no meio da letra
    let text: String = text.chars().take(120).collect();
    let _ = tray.set_tooltip(Some(text.as_str()));
    #[cfg(target_os = "macos")]
    {
        let n = text.split(" · ").nth(1).and_then(|s| s.split_whitespace().next()).unwrap_or("");
        let _ = tray.set_title(Some(n));
    }
}

#[tauri::command]
fn open_main(app: AppHandle, path: String) {
    show_main(&app, &path);
}

#[tauri::command]
fn hide_tracker(app: AppHandle) {
    if let Some(w) = app.get_webview_window("tracker") {
        let _ = w.hide();
    }
}

/// a altura do rastreador e a do que ele mostra — a faixa ou o cartao —, e
/// a largura continua sendo a que a pessoa deixou. na metade de baixo da tela
/// a borda que fica parada e a de baixo: abrir cresce para cima, e nao para
/// dentro da barra de tarefas.
#[tauri::command]
fn fit_tracker(app: AppHandle, height: f64) {
    let Some(w) = app.get_webview_window("tracker") else { return };
    let height = height.clamp(40.0, 640.0);
    let scale = w.scale_factor().unwrap_or(1.0);
    let Ok(inner) = w.inner_size() else { return };
    let inner = inner.to_logical::<f64>(scale);
    if (inner.height - height).abs() < 1.0 {
        return;
    }
    if let (Ok(pos), Ok(Some(m))) = (w.outer_position(), w.current_monitor()) {
        let pos = pos.to_logical::<f64>(scale);
        let top = m.position().to_logical::<f64>(scale).y;
        let screen = m.size().to_logical::<f64>(scale).height;
        if pos.y + inner.height / 2.0 > top + screen / 2.0 {
            let _ = w.set_position(LogicalPosition::new(pos.x, pos.y + inner.height - height));
        }
    }
    let _ = w.set_size(LogicalSize::new(inner.width, height));
}

// ---------- as janelas ----------

fn show_main(app: &AppHandle, path: &str) {
    let Some(w) = app.get_webview_window("main") else { return };
    if !path.is_empty() {
        let _ = w.navigate(page(path));
    }
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
}

/// o clique na bandeja alterna: mostra a faixa ou esconde de vez. o atalho so
/// abre — traz a janela, abre o cartao e poe o cursor no campo, que e para
/// isso que se aperta. quem recolhe e o Esc, ou voltar para o trabalho.
fn toggle_tracker(app: &AppHandle, focus_field: bool) {
    let Some(w) = app.get_webview_window("tracker") else { return };
    if !focus_field && w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    let _ = w.show();
    let _ = w.set_focus();
    if focus_field {
        let _ = w.eval("window.dispatchEvent(new Event('merlin:focus'))");
    }
}

fn build_windows(app: &AppHandle, background: bool) -> tauri::Result<()> {
    let main = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(page("index.html")))
        .title("Merlin")
        .inner_size(1280.0, 820.0)
        .min_inner_size(420.0, 520.0)
        .visible(!background)
        .build()?;
    let handle = main.clone();
    main.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
    });

    // na primeira vez, no canto de baixo a direita, acima da barra de tarefas.
    // depois disso vale onde a pessoa deixou (tauri-plugin-window-state).
    let mut builder = WebviewWindowBuilder::new(app, "tracker", WebviewUrl::External(page("tracker.html")))
        .title("Merlin · rastreador")
        .inner_size(TRACKER_W, TRACKER_H)
        .min_inner_size(300.0, 40.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true);
    if let Some(m) = app.primary_monitor()? {
        let scale = m.scale_factor();
        let size = m.size().to_logical::<f64>(scale);
        let pos = m.position().to_logical::<f64>(scale);
        builder = builder.position(
            pos.x + size.width - TRACKER_W - 24.0,
            pos.y + size.height - TRACKER_H - 72.0,
        );
    }
    let tracker = builder.build()?;
    // Alt+F4 no rastreador tambem so esconde: destruida, a janela nao volta
    // pelo atalho nem pela bandeja ate o app reabrir
    let handle = tracker.clone();
    tracker.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
    });
    Ok(())
}

// ---------- a bandeja ----------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let tracker = MenuItem::with_id(app, "tracker", "Escrever no rastreador    Alt+Shift+M", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Abrir o Merlin", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", AUTOSTART_LABEL, true, autostart_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &tracker,
            &open,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let check = autostart.clone();
    TrayIconBuilder::with_id(TRAY)
        .icon(app.default_window_icon().cloned().expect("o app tem icone"))
        .tooltip("Merlin")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "tracker" => toggle_tracker(app, true),
            "open" => show_main(app, ""),
            "autostart" => {
                let launch = app.autolaunch();
                let on = launch.is_enabled().unwrap_or(false);
                let _ = if on { launch.disable() } else { launch.enable() };
                // o check segue o que o sistema diz, e nao o clique: se ligar
                // falhou, o menu nao pode mentir que ligou
                let _ = check.set_checked(launch.is_enabled().unwrap_or(!on));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_tracker(tray.app_handle(), false);
            }
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        // abrir o app de novo nao abre um segundo: traz a janela do primeiro
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app, "")))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![BACKGROUND])))
        // posicao e tamanho, sim; visibilidade, nao — quem decide o que aparece
        // ao abrir e o --background, e nao como o app estava ao sair
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_tracker(app, true);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_status, open_main, hide_tracker, fit_tracker])
        .setup(|app| {
            let background = std::env::args().any(|a| a == BACKGROUND);
            build_windows(app.handle(), background)?;
            build_tray(app.handle())?;
            // outro programa pode ja ter o atalho; o app abre do mesmo jeito
            let shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyM);
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("atalho Alt+Shift+M indisponivel: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("o Merlin nao abriu");
}
