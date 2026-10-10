fn main() {
    // os comandos que o site pode pedir ao app. listar aqui gera as permissoes
    // allow-<comando>, que a capability "remote" entrega ao endereco do Merlin
    // — e a nenhum outro.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["set_status", "open_main", "hide_tracker", "fit_tracker"]),
    ))
    .expect("falhou o build do tauri");
}
