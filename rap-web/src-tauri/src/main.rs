// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

// This file acts as a conditional entry point.
// It will compile one of the two modules below based on the "bundle-server" feature flag.

#[cfg(not(feature = "bundle-server"))]
#[path = "main_dev.rs"]
mod main_logic;

#[cfg(feature = "bundle-server")]
#[path = "main_bundle.rs"]
mod main_logic;

fn main() {
    main_logic::main();
}