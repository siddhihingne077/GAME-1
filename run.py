import subprocess
import sys
import webbrowser
import os
import time
from pathlib import Path

PORT = 5001  # Use 5001 to avoid macOS AirPlay conflict on 5000

def run_app():
    print("🚀 Starting Memory Master Platform...")
    
    # 1. Install requirements
    print("📦 Installing dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    except Exception as e:
        print(f"❌ Error installing dependencies: {e}")
        return

    # 2. Run Flask backend (serves both API and frontend)
    print(f"🖥️ Starting Flask server on port {PORT}...")
    env = os.environ.copy()
    env["PORT"] = str(PORT)
    backend_process = subprocess.Popen([sys.executable, "app.py"], env=env)

    # 3. Give the server a moment to start
    time.sleep(2)

    # 4. Open the game frontend in the browser
    url = f"http://localhost:{PORT}"
    print(f"🌐 Opening Game UI: {url}")
    webbrowser.open(url)

    print("\n✅ Platform is running!")
    print(f"🎮 Game UI:  http://localhost:{PORT}")
    print(f"📡 API:      http://localhost:{PORT}/api/...")
    print("Press Ctrl+C in this terminal to stop.")
    
    try:
        backend_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Stopping Memory Master...")
        backend_process.terminate()

if __name__ == "__main__":
    run_app()
