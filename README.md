# Memory Master 🧠

A premium gaming platform designed to sharpen your memory and reflexes.

## Features

- **Room Observer (Memory Game)**: 300 levels of increasing difficulty. Observe objects and recall their colors.
- **F1 Reaction**: Test your reflexes against the world's fastest drivers with an interactive 5-light sequence.
- **Schulte Table**: A classic cognitive test. Find numbers in order as fast as possible.
- **Rewards System**: Earn coins and stars to track your progress.
- **Social Login**: Google authentication simulation.
- **Premium Design**: Dark mode, glassmorphism, and smooth GSAP animations.

## Tech Stack

- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript
- **Animations**: GSAP (GreenSock Animation Platform)
- **Backend (Optional/API)**: Flask (Python), SQLAlchemy
- **Database**: SQLite (default), supports MySQL/PostgreSQL

## Setup

### Prerequisites
- Python 3.8+

### Installation

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the platform:
   ```bash
   python run.py
   ```

## Project Structure

```text
├── app.py              # Flask API and Models
├── index.html          # Main entry point
├── style.css           # Core design system
├── app.js              # SPA Logic & Games
├── run.py              # Automation script
├── requirements.txt    # Python dependencies
└── README.md           # Documentation
```
