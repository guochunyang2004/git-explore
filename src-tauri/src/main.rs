// 防止 windows 下 main 警告
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    git_explore_lib::run()
}
