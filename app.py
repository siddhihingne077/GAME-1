from flask import Flask, jsonify, request, session, redirect, url_for, send_from_directory
# Imports Flask framework and its utilities

from flask_cors import CORS
# Imports CORS (Cross-Origin Resource Sharing)

from flask_sqlalchemy import SQLAlchemy
# Imports SQLAlchemy ORM

import os
import json
import requests as http_requests
# http_requests is used for fetching Google's public keys during token verification

from dotenv import load_dotenv

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
# Google libraries for verifying the OAuth2 ID token sent from the frontend

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev_secret_key")

# Google OAuth Client ID
GOOGLE_CLIENT_ID = "253566578017-e11j4dmmphh8pta941dgqftjpplbshs9.apps.googleusercontent.com"

CORS(app, supports_credentials=True)
# supports_credentials=True allows cookies/sessions to be sent cross-origin

# Database Configuration
# You can switch between SQLite, MySQL, or PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///memory_master.db")
# Reads the database connection URL from environment; defaults to a local SQLite file called memory_master.db

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
# Configures SQLAlchemy to connect to the specified database

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Disables SQLAlchemy modification tracking to save memory and avoid unnecessary overhead

db = SQLAlchemy(app)
# Initializes the SQLAlchemy database instance and binds it to the Flask app

# Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    google_id = db.Column(db.String(100), unique=True, nullable=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    picture = db.Column(db.String(500), nullable=True)
    # Google profile picture URL
    coins = db.Column(db.Integer, default=0)
    stars = db.Column(db.Integer, default=0)
    progress = db.relationship('GameProgress', backref='user', lazy=True)

class GameProgress(db.Model):
    # Defines the GameProgress database table — stores per-game statistics for each user

    id = db.Column(db.Integer, primary_key=True)
    # Auto-incrementing unique identifier for each progress record

    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # Links this progress record to a specific user via foreign key

    game_type = db.Column(db.String(50), nullable=False) # 'memory', 'f1', 'schulte', 'confusion'
    # Identifies which game this record belongs to (one of the four game types)

    score = db.Column(db.Float, default=0.0)
    # The player's best score for this game type; meaning varies per game (points, time, etc.)

    level = db.Column(db.Integer, default=1)
    # The highest level reached (primarily used by the Room Observer memory game)

    extra_data = db.Column(db.Text, nullable=True) # JSON strings for things like max_combo, avg_rt
    # Stores additional game-specific data as a JSON string (e.g., combo streaks, average reaction times)

# Routes
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# ── Google OAuth Callback ─────────────────────────────────
@app.route('/auth/google/callback', methods=['POST'])
def google_callback():
    """Receives a Google ID token from the frontend, verifies it,
       and creates or finds the corresponding user."""
    data = request.json
    token = data.get('credential')
    if not token:
        return jsonify({"status": "error", "message": "No credential provided"}), 400

    try:
        # Verify the Google ID token using Google's public keys
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID
        )

        google_id = idinfo['sub']        # Unique Google user ID
        email     = idinfo['email']      # User's email
        name      = idinfo.get('name', email.split('@')[0])  # Display name
        picture   = idinfo.get('picture', '')                 # Profile photo URL

    except ValueError:
        return jsonify({"status": "error", "message": "Invalid Google token"}), 401

    # Find existing user by google_id or email, or create a new one
    user = User.query.filter_by(google_id=google_id).first()
    if not user:
        user = User.query.filter_by(email=email).first()

    if user:
        # Update existing user with latest Google data
        user.google_id = google_id
        user.username = name
        user.picture = picture
    else:
        # Create brand-new user
        user = User(google_id=google_id, email=email, username=name, picture=picture)
        db.session.add(user)

    db.session.commit()

    # Store user ID in server-side session for persistence
    session['user_id'] = user.id

    return jsonify({
        "status": "success",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "picture": user.picture,
            "coins": user.coins,
            "stars": user.stars
        }
    })

# ── Session Check ─────────────────────────────────────────
@app.route('/api/me', methods=['GET'])
def get_me():
    """Returns the currently logged-in user from the Flask session,
       so the frontend can restore the session on page load."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "not_logged_in"}), 200

    user = db.session.get(User, user_id)
    if not user:
        session.pop('user_id', None)
        return jsonify({"status": "not_logged_in"}), 200

    return jsonify({
        "status": "success",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "picture": user.picture,
            "coins": user.coins,
            "stars": user.stars
        }
    })

# ── Logout ────────────────────────────────────────────────
@app.route('/api/logout', methods=['POST'])
def logout():
    """Clears the server-side session, logging the user out."""
    session.pop('user_id', None)
    return jsonify({"status": "success"})

# ── Legacy login (kept as fallback for offline mode) ──────
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    username = data.get('username', 'Master Player')
    google_id = data.get('google_id')
    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(email=email, username=username, google_id=google_id)
        db.session.add(user)
        db.session.commit()
    session['user_id'] = user.id
    return jsonify({
        "status": "success",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "picture": getattr(user, 'picture', None),
            "coins": user.coins,
            "stars": user.stars
        }
    })

@app.route('/api/save-progress', methods=['POST'])
# Defines the save-progress API endpoint; accepts POST requests to save game results
def save_progress():
    # Handler function for saving a player's game progress after completing a round
    data = request.json
    # Parses the incoming JSON request body

    user_id = data.get('user_id')
    # Gets the user's ID to identify which player's progress to update

    game_type = data.get('game_type')
    # Gets which game was played ('memory', 'f1', 'schulte', 'confusion')

    score = data.get('score', 0.0)
    # Gets the score achieved; defaults to 0

    level = data.get('level', 1)
    # Gets the level played; defaults to 1

    coins_gained = data.get('coins_gained', 0)
    # Gets the number of coins earned this round

    stars_gained = data.get('stars_gained', 0)
    # Gets the number of stars earned this round

    extra_data = data.get('extra_data', {})
    # Gets any additional game-specific data (e.g., combo, reaction time)

    user = db.session.get(User, user_id)
    # Looks up the user by their ID in the database

    if not user:
        return jsonify({"status": "error", "message": "User not found"}), 404
        # Returns a 404 error if the user doesn't exist in the database

    # Update user stats
    user.coins += coins_gained
    # Adds the newly earned coins to the user's total coin balance

    user.stars += stars_gained
    # Adds the newly earned stars to the user's total star count

    # Update or create game progress
    progress = GameProgress.query.filter_by(user_id=user_id, game_type=game_type).first()
    # Searches for an existing progress record for this user and game type

    if not progress:
        progress = GameProgress(user_id=user_id, game_type=game_type)
        # Creates a new progress record if none exists for this user/game combination

        db.session.add(progress)
        # Stages the new progress record to be added to the database

    # For memory game, update level if higher
    if game_type == 'memory':
        # Special handling for Room Observer: we only update if the player reached a higher level or score
        if level > progress.level:
            progress.level = level
            # Updates the stored level only if the player beat their previous best level

        if score > progress.score:
            progress.score = score
            # Updates the stored score only if the player beat their previous best score

    # For reaction games, update score if better (lower is better for time)
    elif game_type in ['f1', 'schulte']:
        # For F1 Reflex and Schulte Grid, a lower time means better performance
        if progress.score == 0 or score < progress.score:
            progress.score = score
            # Updates the stored score only if this time is faster (lower) than the previous best

    # For Color Confusion, update high score
    elif game_type == 'confusion':
        # For Color Confusion, a higher score is better
        if score > progress.score:
            progress.score = score
            # Updates the stored score only if this score is higher than the previous best

    progress.extra_data = json.dumps(extra_data)
    # Serializes the extra data dictionary into a JSON string and stores it in the database

    db.session.commit()
    # Saves all changes (updated user stats + game progress) to the database

    return jsonify({"status": "success", "coins": user.coins, "stars": user.stars})
    # Returns a success response with the user's updated coin and star totals

@app.route('/api/leaderboard/<game_type>', methods=['GET'])
# Defines the leaderboard API endpoint; takes the game type as a URL parameter
def get_leaderboard(game_type):
    # Handler function to retrieve the top 10 players for a specific game
    # Get top 10 players for the given game type
    if game_type in ['f1', 'schulte']:
        # Lower score (time) is better
        results = GameProgress.query.filter_by(game_type=game_type).order_by(GameProgress.score.asc()).limit(10).all()
        # Queries the database for the top 10 FASTEST times (ascending order) for reaction-based games

    else:
        # Higher score is better
        results = GameProgress.query.filter_by(game_type=game_type).order_by(GameProgress.score.desc()).limit(10).all()
        # Queries the database for the top 10 HIGHEST scores (descending order) for score-based games

    leaderboard = []
    # Initializes an empty list to build the leaderboard response

    for res in results:
        # Iterates through each top player's progress record
        leaderboard.append({
            "username": res.user.username,
            # Gets the player's display name via the relationship backref

            "score": res.score,
            # The player's best score for this game

            "level": res.level,
            # The player's highest level reached

            "extra_data": json.loads(res.extra_data) if res.extra_data else {}
            # Deserializes the extra JSON data back into a dictionary; returns empty dict if none exists
        })

    return jsonify(leaderboard)
    # Returns the leaderboard as a JSON array to the frontend

# ── Color Confusion API Endpoints ─────────────────────────────
# Uses the Python confusion_engine for Stroop question generation and validation

try:
    from confusion_engine import ConfusionEngine, GameSession
    # Attempts to import the Color Confusion game engine module
    _confusion_available = True
    # Flag: the confusion engine was successfully loaded and is available
except ImportError:
    _confusion_available = False
    # Flag: the confusion engine module is missing; related endpoints will return errors

# Active game sessions stored in memory (keyed by user_id or session token)
_active_sessions = {}
# Dictionary to hold active Color Confusion game sessions; maps session IDs to GameSession objects

@app.route('/api/confusion/generate', methods=['POST'])
# Defines the endpoint to generate a new Stroop effect question for Color Confusion
def confusion_generate():
    """Generate a Stroop effect question for the Color Confusion game."""
    # Docstring explaining this endpoint's purpose

    if not _confusion_available:
        return jsonify({"status": "error", "message": "Confusion engine not available"}), 500
        # Returns a 500 server error if the confusion_engine module couldn't be imported

    data = request.json or {}
    # Parses the request body; defaults to empty dict if no JSON is sent

    difficulty = data.get('difficulty', 1)
    # Gets the requested difficulty level (1-5); defaults to easiest

    mode = data.get('mode', 'endless')
    # Gets the game mode ('endless', 'survival', 'speed'); defaults to endless

    session_id = data.get('session_id', 'default')
    # Gets the unique session identifier; defaults to 'default'

    # Create or retrieve session
    if session_id not in _active_sessions or not _active_sessions[session_id].is_active:
        _active_sessions[session_id] = GameSession(mode)
        # Creates a new game session if one doesn't exist or the previous one ended

    session = _active_sessions[session_id]
    # Retrieves the active game session for this player

    question = session.next_question()
    # Generates the next Stroop effect question using the confusion engine

    if question is None:
        report = session.get_final_report()
        # If no more questions (session ended), generate the final performance report

        return jsonify({"status": "finished", "report": report})
        # Returns the final report indicating the game session is complete

    return jsonify({
        "status": "success",
        "question": {
            "text_word": question.text_word,
            # The word displayed on screen (e.g., "YELLOW") — this is the DISTRACTOR

            "font_color_name": question.font_color_name,
            # The actual font color name — this is the CORRECT ANSWER the player must identify

            "font_color_hex": question.font_color_hex,
            # The hex code of the font color for rendering in CSS

            "options": question.options,
            # Four answer choices (one correct + three distractors)

            "difficulty": question.difficulty
            # The current difficulty level affecting the color pool size
        }
    })
    # Returns the generated question data to the frontend for display

@app.route('/api/confusion/validate', methods=['POST'])
# Defines the endpoint to validate a player's answer in Color Confusion
def confusion_validate():
    """Validate a player's answer for the Color Confusion game."""
    # Docstring explaining this endpoint's purpose

    if not _confusion_available:
        return jsonify({"status": "error", "message": "Confusion engine not available"}), 500
        # Returns a 500 error if the engine module is unavailable

    data = request.json or {}
    # Parses the request body

    session_id = data.get('session_id', 'default')
    # Gets the session identifier to find the correct game session

    selected_color = data.get('selected_color', '')
    # Gets the color the player selected as their answer

    reaction_time_ms = data.get('reaction_time_ms', 2000)
    # Gets how fast the player answered in milliseconds; defaults to 2 seconds

    if session_id not in _active_sessions:
        return jsonify({"status": "error", "message": "No active session"}), 404
        # Returns a 404 error if the session doesn't exist (expired or never started)

    session = _active_sessions[session_id]
    # Retrieves the active game session

    result = session.submit_answer(selected_color, reaction_time_ms)
    # Processes the player's answer: checks correctness, updates score, combo, lives/time

    # If game is over, include the final report
    if not result.get('is_active', True):
        # Checks if the game session has ended (lives ran out, time expired, or target reached)
        result['report'] = session.get_final_report()
        # Attaches the final performance report to the response

        # Cleanup session
        del _active_sessions[session_id]
        # Removes the ended session from memory to free resources

    return jsonify({"status": "success", **result})
    # Returns the validation result (correct/wrong, points, combo, lives, etc.) to the frontend

# Serve static frontend files (CSS, JS, images, etc.)
@app.route('/<path:filename>')
# Catch-all route that serves any static file from the current directory (CSS, JS, images, etc.)
def serve_static(filename):
    # Handler function for serving static frontend assets
    return send_from_directory('.', filename)
    # Sends the requested file from the project root directory to the browser

if __name__ == '__main__':
    # This block only runs when the file is executed directly (not when imported as a module)

    with app.app_context():
        # Creates an application context so database operations can run during setup
        db.create_all()
        # Creates all database tables defined by the models (User, GameProgress) if they don't already exist

    # Port is set to 5000 by default or via env
    port = int(os.getenv("PORT", 5000))
    # Reads the port number from environment variable; defaults to 5000

    app.run(debug=True, host='0.0.0.0', port=port)
    # Starts the Flask development server: debug=True enables auto-reload and error pages, host='0.0.0.0' makes it accessible from any network interface
