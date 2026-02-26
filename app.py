from flask import Flask, jsonify, request, session, redirect, url_for, send_from_directory
# Imports Flask framework and its utilities

from flask_cors import CORS
# Imports CORS (Cross-Origin Resource Sharing)

import firebase_admin
from firebase_admin import credentials, auth, firestore

import os
import json

from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev_secret_key")

# Firebase Initialization
# Expects a serviceAccountKey.json file in the root directory
# If not present, it will attempt to initialize using environment variables or default credentials
try:
    if os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
    else:
        # Fallback to default credentials (useful for some environments)
        firebase_admin.initialize_app()
    
    db_firestore = firestore.client()
    print("Firebase initialized successfully.")
except Exception as e:
    print(f"Error initializing Firebase: {e}")
    print("Make sure serviceAccountKey.json is present or environment variables are set.")
    db_firestore = None

CORS(app, supports_credentials=True)
# supports_credentials=True allows cookies/sessions to be sent cross-origin

# Helper functions for Firestore replacement of User/GameProgress models
def get_user(user_id):
    if not db_firestore: return None
    user_ref = db_firestore.collection('users').document(str(user_id))
    doc = user_ref.get()
    if doc.exists:
        return doc.to_dict()
    return None

def update_user(user_id, data):
    if not db_firestore: return
    user_ref = db_firestore.collection('users').document(str(user_id))
    user_ref.set(data, merge=True)

# Routes
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# ── Google OAuth Callback ─────────────────────────────────
@app.route('/auth/firebase/callback', methods=['POST'])
def firebase_callback():
    """Receives a Firebase ID token from the frontend, verifies it,
       and creates or finds the corresponding user in Firestore."""
    if not db_firestore:
        return jsonify({"status": "error", "message": "Firebase not initialized"}), 500

    data = request.json
    token = data.get('idToken')
    if not token:
        return jsonify({"status": "error", "message": "No token provided"}), 400

    try:
        # Verify the ID token sent by the client
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']
        email = decoded_token.get('email')
        name = decoded_token.get('name', email.split('@')[0])
        picture = decoded_token.get('picture', '')

        # Use Firestore to find or create user
        user_ref = db_firestore.collection('users').document(uid)
        user_doc = user_ref.get()

        if user_doc.exists:
            user_data = user_doc.to_dict()
            # Update latest profile info
            user_data.update({
                "username": name,
                "picture": picture
            })
            user_ref.set(user_data, merge=True)
        else:
            # Create new user document
            user_data = {
                "id": uid,
                "email": email,
                "username": name,
                "picture": picture,
                "coins": 0,
                "stars": 0
            }
            user_ref.set(user_data)

        # Store UID in session
        session['user_id'] = uid

        return jsonify({
            "status": "success",
            "user": user_data
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 401

# ── Session Check ─────────────────────────────────────────
@app.route('/api/me', methods=['GET'])
def get_me():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "not_logged_in"}), 200

    user_data = get_user(user_id)
    if not user_data:
        session.pop('user_id', None)
        return jsonify({"status": "not_logged_in"}), 200

    return jsonify({
        "status": "success",
        "user": user_data
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
    # Kept for compatibility but should use firebase_callback
    data = request.json
    uid = data.get('uid')
    if not uid: return jsonify({"status": "error"}), 400
    
    user_data = get_user(uid)
    if not user_data:
        user_data = {
            "id": uid,
            "email": data.get('email'),
            "username": data.get('username', 'Master Player'),
            "coins": 0,
            "stars": 0
        }
        update_user(uid, user_data)
    
    session['user_id'] = uid
    return jsonify({"status": "success", "user": user_data})

@app.route('/api/save-progress', methods=['POST'])
def save_progress():
    if not db_firestore:
        return jsonify({"status": "error", "message": "Firebase not initialized"}), 500

    data = request.json
    user_id = data.get('user_id')
    game_type = data.get('game_type')
    score = data.get('score', 0.0)
    level = data.get('level', 1)
    coins_gained = data.get('coins_gained', 0)
    stars_gained = data.get('stars_gained', 0)
    extra_data = data.get('extra_data', {})

    user_ref = db_firestore.collection('users').document(str(user_id))
    user_doc = user_ref.get()

    if not user_doc.exists:
        return jsonify({"status": "error", "message": "User not found"}), 404

    user_data = user_doc.to_dict()
    user_data['coins'] = user_data.get('coins', 0) + coins_gained
    user_data['stars'] = user_data.get('stars', 0) + stars_gained
    user_ref.set(user_data, merge=True)

    # Progress collection
    progress_ref = db_firestore.collection('progress').document(f"{user_id}_{game_type}")
    progress_doc = progress_ref.get()
    
    progress = progress_doc.to_dict() if progress_doc.exists else {
        "user_id": user_id,
        "username": user_data.get('username'),
        "game_type": game_type,
        "score": 0.0,
        "level": 1
    }

    if game_type == 'memory':
        if level > progress.get('level', 1): progress['level'] = level
        if score > progress.get('score', 0.0): progress['score'] = score
    elif game_type in ['f1', 'schulte']:
        if progress['score'] == 0 or score < progress['score']: progress['score'] = score
    elif game_type == 'confusion':
        if score > progress['score']: progress['score'] = score

    progress['extra_data'] = extra_data
    progress_ref.set(progress)

    return jsonify({"status": "success", "coins": user_data['coins'], "stars": user_data['stars']})
    # Returns a success response with the user's updated coin and star totals

@app.route('/api/leaderboard/<game_type>', methods=['GET'])
def get_leaderboard(game_type):
    if not db_firestore:
        return jsonify({"status": "error", "message": "Firebase not initialized"}), 500

    query = db_firestore.collection('progress').where('game_type', '==', game_type)
    
    if game_type in ['f1', 'schulte']:
        # Lower score (time) is better
        results = query.order_by('score', direction=firestore.Query.ASCENDING).limit(10).stream()
    else:
        # Higher score is better
        results = query.order_by('score', direction=firestore.Query.DESCENDING).limit(10).stream()

    leaderboard = []
    for doc in results:
        res = doc.to_dict()
        leaderboard.append({
            "username": res.get('username', 'Anonymous'),
            "score": res.get('score'),
            "level": res.get('level'),
            "extra_data": res.get('extra_data', {})
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

    # Firebase initialization handled at top level now
    pass

    # Port is set to 5000 by default or via env
    port = int(os.getenv("PORT", 5000))
    # Reads the port number from environment variable; defaults to 5000

    app.run(debug=True, host='0.0.0.0', port=port)
    # Starts the Flask development server: debug=True enables auto-reload and error pages, host='0.0.0.0' makes it accessible from any network interface
