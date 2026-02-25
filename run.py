import subprocess
# Imports the subprocess module to run external commands (pip install, flask server) from within this script

import sys
# Imports the sys module to access the current Python interpreter path (sys.executable)

import webbrowser
# Imports the webbrowser module to automatically open the game URL in the user's default browser

import os
# Imports os module to access and copy environment variables

import time
# Imports the time module to add a delay before opening the browser (gives the server time to start)

from pathlib import Path
# Imports Path for cross-platform file path handling (not directly used but available for future use)

PORT = 5001  # Use 5001 to avoid macOS AirPlay conflict on 5000
# Sets the server port to 5001 because macOS uses port 5000 for AirPlay Receiver by default

def run_app():
    # Main function that orchestrates the entire game launch process

    print("Starting Memory Master Platform...")
    # Prints a startup message to the terminal to inform the user that the launch process has begun

    # 1. Install requirements
    print("Installing dependencies...")
    # Informs the user that Python package dependencies are being installed

    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        # Runs 'pip install -r requirements.txt' using the current Python interpreter to install all required packages (Flask, SQLAlchemy, etc.)

    except Exception as e:
        print(f"Error installing dependencies: {e}")
        # If installation fails (e.g., missing requirements.txt, network error), prints the error message

        return
        # Exits the function early — the game cannot run without its dependencies

    # 2. Run Flask backend (serves both API and frontend)
    print(f"Starting Flask server on port {PORT}...")
    # Informs the user that the Flask server is about to start

    env = os.environ.copy()
    # Creates a copy of the current system environment variables to pass to the Flask subprocess

    env["PORT"] = str(PORT)
    # Sets the PORT environment variable so app.py knows which port to listen on

    backend_process = subprocess.Popen([sys.executable, "app.py"], env=env)
    # Launches app.py as a background subprocess — this starts the Flask web server that serves both the game API and frontend files

    # 3. Give the server a moment to start
    time.sleep(2)
    # Waits 2 seconds to allow the Flask server to fully initialize before trying to open the browser

    # 4. Open the game frontend in the browser
    url = f"http://localhost:{PORT}"
    # Constructs the URL where the game will be accessible

    print(f"Opening Game UI: {url}")
    # Informs the user that the browser is about to open

    webbrowser.open(url)
    # Automatically opens the game in the user's default web browser

    print("\nPlatform is running!")
    # Confirms that everything started successfully

    print(f"Game UI:  http://localhost:{PORT}")
    # Displays the URL where the game frontend can be accessed

    print(f"API:      http://localhost:{PORT}/api/...")
    # Displays the base URL for the backend API endpoints

    print("Press Ctrl+C in this terminal to stop.")
    # Instructs the user how to stop the server when they're done playing

    try:
        backend_process.wait()
        # Keeps this script running by waiting for the Flask server process to finish — this blocks until the server is stopped

    except KeyboardInterrupt:
        # Catches Ctrl+C keyboard interrupt so the server can be shut down gracefully
        print("\nStopping Memory Master...")
        # Informs the user that the server is shutting down

        backend_process.terminate()
        # Sends a termination signal to the Flask server subprocess to stop it cleanly

if __name__ == "__main__":
    # This block ensures run_app() only executes when this file is run directly (not imported)

    run_app()
    # Calls the main function to start the entire game platform
