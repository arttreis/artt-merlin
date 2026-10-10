// sem isto o Windows abre um console preto atras do app no build de release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    merlin_desktop_lib::run()
}
