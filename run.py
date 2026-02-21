import subprocess
import sys
import webbrowser
import os
import time
from pathlib import Path

def run_app():
    print("🚀 Starting Memory Master Platform...")
    
    # 1. Install requirements
    print("📦 Installing dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    except Exception as e:
        print(f"❌ Error installing dependencies: {e}")
        return

    # 2. Run Backend in a separate process
    backend_path = "app.py"
    print(f"🖥️ Starting Flask Backend ({backend_path})...")
    backend_process = subprocess.Popen([sys.executable, backend_path])

    # 3. Give the server a moment to start
    time.sleep(2)

    # 4. Open the frontend in the browser
    frontend_path = Path("index.html").resolve()
    frontend_url = frontend_path.as_uri()
    print(f"🌐 Opening Frontend: {frontend_path}")
    webbrowser.open(frontend_url)

    print("\n✅ Platform is running!")
    print("Press Ctrl+C in this terminal to stop the backend.")
    
    try:
        backend_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Stopping Memory Master...")
        backend_process.terminate()

if __name__ == "__main__":
    run_app()
