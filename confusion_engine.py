"""
Color Confusion — Python Game Engine
Stroop Effect question generation, validation, and scoring logic.
Used by the Flask API to serve game data to the frontend.
"""
# Module docstring: This file implements the backend engine for the Color Confusion game, handling Stroop Effect question creation, answer checking, scoring, and session management

import random
# Imports the random module for shuffling colors and generating randomized Stroop questions

import time
# Imports the time module for tracking session duration and question timestamps

import json
# Imports json module for serializing the final game report (used in CLI test)

from dataclasses import dataclass, field, asdict
# Imports dataclass utilities: @dataclass auto-generates constructors/repr, field() sets default factories, asdict() converts dataclass to dict

from typing import List, Dict, Optional, Tuple
# Imports type hints for better code documentation and IDE support

# ── Color Palette ─────────────────────────────────────────────
COLORS = {
    'Red':      '#ef4444',
    'Blue':     '#3b82f6',
    'Green':    '#22c55e',
    'Yellow':   '#eab308',
    'Purple':   '#8b5cf6',
    'Orange':   '#f97316',
    'Pink':     '#ff29ff',
    'Cyan':     '#06b6d4',
    'Indigo':   '#6366f1',
    'Violet':   '#8b5cf6',
    'Black':    '#1a1a1a',
    'Brown':    '#78350f',
    'Lavender': '#a78bfa',
    'White':    '#ffffff',
    'Beige':    '#f5f5dc',
}
# Master dictionary mapping color names to their CSS hex codes — used for rendering text in the correct font color on the frontend

# Difficulty tiers — more colors = harder
DIFFICULTY_TIERS = {
    1: ['Red', 'Blue', 'Green', 'Yellow'],
    # Tier 1 (Easiest): Only 4 basic colors — easy to distinguish

    2: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'],
    # Tier 2: Adds Purple and Orange — 6 colors to choose from

    3: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Cyan'],
    # Tier 3: Adds Pink and Cyan — 8 colors increase confusion

    4: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Cyan', 'Indigo', 'Violet'],
    # Tier 4: Adds Indigo and Violet — 10 colors; similar shades make it much harder

    5: list(COLORS.keys()),  # All colors
    # Tier 5 (Hardest): Uses every color in the palette — maximum cognitive challenge
}


@dataclass
class StroopQuestion:
    """A single Stroop effect question."""
    # Dataclass representing one Stroop Effect question shown to the player

    text_word: str          # The word displayed (e.g., "YELLOW")
    # The text written on screen — this is the DISTRACTOR that tries to trick the player

    font_color_name: str    # The actual font color name (e.g., "Red")
    # The name of the actual font color — this is what the player must identify (the CORRECT ANSWER)

    font_color_hex: str     # Hex for the font color
    # The CSS hex code of the font color — used by the frontend to render the word in this color

    options: List[str]      # 4 answer choices
    # List of 4 color name strings: 1 correct answer + 3 distractors

    difficulty: int         # Current difficulty level
    # The difficulty tier (1-5) at which this question was generated

    timestamp: float = field(default_factory=time.time)
    # Automatically records when this question was created (Unix timestamp)

    def to_dict(self) -> dict:
        # Converts this question object into a plain Python dictionary for JSON serialization
        return asdict(self)
        # Uses the dataclass asdict() helper to convert all fields to a dictionary


@dataclass
class AnswerResult:
    """Result of a single answer validation."""
    # Dataclass holding the outcome of validating a player's answer

    correct: bool
    # Whether the player's answer was correct (True) or wrong (False)

    reaction_time_ms: int
    # How fast the player answered in milliseconds

    points_earned: int
    # Total points earned for this answer (base + speed bonus × combo multiplier)

    combo: int
    # Current combo streak count (resets to 0 on wrong answer)

    speed_bonus: int
    # Extra points earned for answering quickly (within 2 seconds)

    multiplier: float
    # Combo multiplier applied to points (increases with consecutive correct answers)


class ConfusionEngine:
    """
    Core Stroop Effect game engine.
    
    Handles question generation, answer validation,
    scoring with combo multipliers, and difficulty scaling.
    """
    # The main engine class that powers the Color Confusion game logic
    
    def __init__(self, difficulty: int = 1):
        # Constructor: initializes the engine with a starting difficulty level

        self.difficulty = max(1, min(5, difficulty))
        # Clamps the difficulty between 1 and 5 to prevent invalid values

        self._color_pool = self._get_color_pool()
        # Loads the available colors for the current difficulty tier
    
    def _get_color_pool(self) -> List[str]:
        """Get available colors based on difficulty."""
        # Returns the list of color names available at the current difficulty level

        tier = min(self.difficulty, max(DIFFICULTY_TIERS.keys()))
        # Ensures the tier doesn't exceed the maximum defined tier

        return DIFFICULTY_TIERS.get(tier, DIFFICULTY_TIERS[1])
        # Looks up the color list for this tier; falls back to tier 1 if not found
    
    def generate_question(self) -> StroopQuestion:
        """
        Generate a Stroop question where the displayed word
        and its font color are always different (the Stroop effect).
        """
        # Creates a new question where the word text and its font color are deliberately mismatched to create the Stroop Effect

        pool = self._color_pool
        # Gets the available colors for the current difficulty level
        
        # Pick the font color (this is the CORRECT answer)
        font_color_name = random.choice(pool)
        # Randomly selects which color the text will actually be rendered in — the player must identify THIS color
        
        # Pick a DIFFERENT word to display (creates the Stroop effect)
        available_words = [c for c in pool if c != font_color_name]
        # Filters out the font color to ensure the displayed word is always different from the actual color

        text_word = random.choice(available_words) if available_words else 'Black'
        # Picks a random different color name as the displayed word; uses 'Black' as fallback if pool is too small
        
        # Build 4 options: correct + 3 distractors
        distractors = [c for c in pool if c != font_color_name and c != text_word]
        # Creates a list of potential wrong answers by excluding both the correct answer and the displayed word

        random.shuffle(distractors)
        # Randomizes the distractor order so different ones are picked each time

        options = [font_color_name] + distractors[:3]
        # Builds the options list: the correct answer plus up to 3 random distractors
        
        # Ensure we have exactly 4 options
        while len(options) < 4:
            # If there aren't enough distractors (small color pool), adds more from the full color list

            filler = random.choice(list(COLORS.keys()))
            # Picks a random color from the entire palette as a filler

            if filler not in options:
                options.append(filler)
                # Adds the filler only if it's not already in the options to avoid duplicates
        
        random.shuffle(options)
        # Shuffles all 4 options so the correct answer isn't always in the same position
        
        return StroopQuestion(
            text_word=text_word.upper(),
            # The displayed word in uppercase (e.g., "YELLOW") — the visual distractor

            font_color_name=font_color_name,
            # The actual font color name — the correct answer

            font_color_hex=COLORS.get(font_color_name, '#888'),
            # The hex code for the font color; falls back to gray if color not found

            options=options,
            # The 4 shuffled answer choices

            difficulty=self.difficulty
            # Records the difficulty level at which this question was generated
        )
    
    def validate_answer(
        self,
        question: StroopQuestion,
        selected_color: str,
        reaction_time_ms: int,
        current_combo: int
    ) -> AnswerResult:
        """
        Validate a player's answer and calculate points.
        
        Scoring:
        - Base: 10 points per correct answer
        - Speed bonus: up to 20 extra points for fast reactions (<2s)
        - Combo multiplier: 1 + (combo * 0.1), e.g., 5-streak = 1.5x
        """
        # Checks if the player selected the correct font color and calculates their score

        correct = selected_color.lower() == question.font_color_name.lower()
        # Case-insensitive comparison between the player's selection and the correct answer
        
        if correct:
            # If the player answered correctly:

            combo = current_combo + 1
            # Increments the combo streak counter

            base_points = 10
            # Base points awarded for a correct answer

            speed_bonus = max(0, (2000 - reaction_time_ms) // 100)
            # Calculates speed bonus: faster answers (under 2 seconds) earn up to 20 extra points; 100ms per bonus point

            multiplier = 1.0 + (combo * 0.1)
            # Combo multiplier increases by 0.1 per consecutive correct answer (e.g., 5-streak = 1.5x)

            points = round((base_points + speed_bonus) * multiplier)
            # Total points = (base + speed bonus) × combo multiplier, rounded to nearest integer

        else:
            # If the player answered incorrectly:

            combo = 0
            # Resets the combo streak to 0

            base_points = 0
            # No base points for wrong answers

            speed_bonus = 0
            # No speed bonus for wrong answers

            multiplier = 1.0
            # Multiplier resets to 1.0 (no bonus)

            points = 0
            # Zero points earned for an incorrect answer
        
        return AnswerResult(
            correct=correct,
            # Whether the answer was right or wrong

            reaction_time_ms=reaction_time_ms,
            # The player's reaction time

            points_earned=points,
            # Total points earned this round

            combo=combo,
            # Updated combo streak count

            speed_bonus=speed_bonus,
            # Speed bonus points earned

            multiplier=multiplier
            # The combo multiplier that was applied
        )
    
    def scale_difficulty(self, score: int) -> None:
        """Auto-scale difficulty based on score milestones."""
        # Automatically increases the difficulty as the player scores more correct answers

        if score >= 40:
            self.difficulty = 5
            # 40+ correct: Maximum difficulty with all 15 colors

        elif score >= 30:
            self.difficulty = 4
            # 30+ correct: 10 colors including similar shades (Indigo, Violet)

        elif score >= 20:
            self.difficulty = 3
            # 20+ correct: 8 colors adding Pink and Cyan

        elif score >= 10:
            self.difficulty = 2
            # 10+ correct: 6 colors adding Purple and Orange

        else:
            self.difficulty = 1
            # Below 10: Easiest with only 4 basic colors

        self._color_pool = self._get_color_pool()
        # Refreshes the available color pool to match the new difficulty tier
    
    def get_performance_rating(
        self,
        avg_reaction_ms: float,
        total_score: int
    ) -> str:
        """Assign a performance rating based on reaction time and score."""
        # Evaluates the player's overall performance and assigns a rank title

        if avg_reaction_ms < 600 and total_score > 40:
            return "Grandmaster"
            # Lightning-fast reactions AND high score — the best possible rating

        elif avg_reaction_ms < 800 and total_score > 25:
            return "Expert"
            # Very fast reactions with a strong score

        elif avg_reaction_ms < 1000 and total_score > 15:
            return "Advanced"
            # Good reaction time with a solid score

        elif avg_reaction_ms < 1200 and total_score > 8:
            return "Intermediate"
            # Decent reaction time with a moderate score

        elif total_score > 3:
            return "Beginner"
            # Player got a few correct but needs more practice

        else:
            return "Trainee"
            # Very few correct answers — just starting out


# ── Session Manager ───────────────────────────────────────────

class GameSession:
    """
    Manages a complete Color Confusion game session.
    
    Modes:
    - endless:   3 lives, play until lives run out
    - survival:  60s timer, +3s correct / -3s wrong
    - speed:     race to 50 correct answers
    """
    # Session class that tracks an entire game playthrough including score, lives, timer, and combo streaks
    
    def __init__(self, mode: str = 'endless'):
        # Constructor: initializes a new game session with the specified mode

        self.mode = mode
        # Stores the game mode ('endless', 'survival', or 'speed')

        self.engine = ConfusionEngine(difficulty=1)
        # Creates a new ConfusionEngine starting at difficulty 1

        self.score = 0
        # Tracks the number of correct answers

        self.total_points = 0
        # Tracks the cumulative point score (includes speed bonuses and combo multipliers)

        self.combo = 0
        # Current consecutive correct answer streak

        self.max_combo = 0
        # Highest combo streak achieved during this session

        self.lives = 3 if mode == 'endless' else -1
        # Endless mode starts with 3 lives; other modes don't use lives (-1 means disabled)

        self.time_left = 60.0 if mode == 'survival' else -1
        # Survival mode starts with 60 seconds; other modes don't use a timer (-1 means disabled)

        self.target = 50 if mode == 'speed' else -1
        # Speed mode requires 50 correct answers to win; other modes don't have a target (-1 means disabled)

        self.reactions: List[int] = []
        # List storing every reaction time (in ms) for calculating the average at the end

        self.start_time = time.time()
        # Records when the session started (Unix timestamp) for calculating total elapsed time

        self.is_active = True
        # Flag indicating whether the session is still ongoing (False when game over)

        self.current_question: Optional[StroopQuestion] = None
        # Stores the current question being asked; None when no question is active
    
    def next_question(self) -> Optional[StroopQuestion]:
        """Generate the next question if session is still active."""
        # Creates and returns the next Stroop question, or None if the game has ended

        if not self.is_active:
            return None
            # Returns None if the session is over — no more questions to generate

        self.current_question = self.engine.generate_question()
        # Uses the engine to create a new randomized Stroop question

        return self.current_question
        # Returns the generated question to be sent to the frontend
    
    def submit_answer(self, selected_color: str, reaction_time_ms: int) -> dict:
        """Process an answer and return the result with updated session state."""
        # Handles a player's answer submission: validates it, updates score/lives/time, and returns the result

        if not self.is_active or not self.current_question:
            return {"error": "No active question"}
            # Returns an error if there's no active session or no question was asked

        result = self.engine.validate_answer(
            self.current_question, selected_color, reaction_time_ms, self.combo
        )
        # Validates the answer using the engine's scoring logic (checks correctness, calculates points and combo)
        
        self.reactions.append(reaction_time_ms)
        # Records this reaction time for the end-of-game average calculation
        
        if result.correct:
            # If the player answered correctly:

            self.score += 1
            # Increments the correct answer counter

            self.combo = result.combo
            # Updates the combo streak from the validation result

            self.max_combo = max(self.max_combo, self.combo)
            # Updates the max combo if the current streak is the longest so far

            self.total_points += result.points_earned
            # Adds the earned points (with bonuses) to the total score
            
            # Mode-specific rewards
            if self.mode == 'survival':
                self.time_left += 3
                # In Survival mode, correct answers reward +3 seconds to the timer
            
            # Difficulty scaling every 5 correct
            if self.score % 5 == 0:
                self.engine.scale_difficulty(self.score)
                # Every 5 correct answers, the engine increases the difficulty (more colors in the pool)

        else:
            # If the player answered incorrectly:

            self.combo = 0
            # Resets the combo streak to 0
            
            # Mode-specific penalties
            if self.mode == 'endless':
                self.lives -= 1
                # In Endless mode, wrong answers cost 1 life

                if self.lives <= 0:
                    self.is_active = False
                    # Game over when all lives are lost

            elif self.mode == 'survival':
                self.time_left = max(0, self.time_left - 3)
                # In Survival mode, wrong answers deduct 3 seconds from the timer

                if self.time_left <= 0:
                    self.is_active = False
                    # Game over when the timer reaches zero

            elif self.mode == 'speed':
                self.total_points = max(0, self.total_points - 5)
                # In Speed mode, wrong answers deduct 5 points as a penalty (can't go below 0)
        
        # Speed run win condition
        if self.mode == 'speed' and self.score >= self.target:
            self.is_active = False
            # In Speed mode, the game ends (as a WIN) when the player reaches the target of 50 correct answers
        
        return {
            "correct": result.correct,
            # Whether this answer was correct

            "points_earned": result.points_earned,
            # Points earned for this specific answer

            "total_points": self.total_points,
            # Running total of all points earned so far

            "score": self.score,
            # Total number of correct answers so far

            "combo": self.combo,
            # Current combo streak count

            "max_combo": self.max_combo,
            # Highest combo achieved in this session

            "lives": self.lives,
            # Remaining lives (Endless mode only; -1 for other modes)

            "time_left": round(self.time_left, 1) if self.time_left >= 0 else -1,
            # Remaining time in seconds (Survival mode only; -1 for other modes)

            "is_active": self.is_active,
            # Whether the game is still ongoing

            "speed_bonus": result.speed_bonus,
            # Speed bonus points earned for this answer

            "multiplier": result.multiplier,
            # Combo multiplier applied to this answer's points
        }
    
    def get_final_report(self) -> dict:
        """Generate the end-of-session report."""
        # Creates a comprehensive performance summary when the game session ends

        elapsed = round(time.time() - self.start_time, 2)
        # Calculates total time played in seconds (rounded to 2 decimal places)

        avg_rt = (
            round(sum(self.reactions) / len(self.reactions))
            if self.reactions else 0
        )
        # Calculates the average reaction time across all answers; returns 0 if no answers were given

        rating = self.engine.get_performance_rating(avg_rt, self.score)
        # Gets the player's performance rating title based on their average reaction time and total score
        
        return {
            "mode": self.mode,
            # Which game mode was played

            "total_points": self.total_points,
            # Final cumulative point score

            "score": self.score,
            # Total number of correct answers

            "max_combo": self.max_combo,
            # Longest consecutive correct answer streak

            "avg_reaction_ms": avg_rt,
            # Average reaction time in milliseconds

            "elapsed_seconds": elapsed,
            # Total time spent playing in seconds

            "rating": rating,
            # Performance rating title (Trainee → Grandmaster)

            "total_questions": len(self.reactions),
            # Total number of questions answered (correct + wrong)

            "accuracy": round(self.score / max(1, len(self.reactions)) * 100, 1),
            # Accuracy percentage: (correct / total) × 100, rounded to 1 decimal; max(1,...) prevents division by zero
        }


# ── CLI Test ──────────────────────────────────────────────────
if __name__ == '__main__':
    # This block only runs when the file is executed directly (not when imported by app.py)

    print("=== Color Confusion Engine Test ===\n")
    # Prints a header for the test output
    
    engine = ConfusionEngine(difficulty=2)
    # Creates a test engine at difficulty 2 (6 colors)
    
    for i in range(5):
        # Generates and tests 5 Stroop questions

        q = engine.generate_question()
        # Creates a new Stroop question

        print(f"Q{i+1}: Word='{q.text_word}' | Font Color='{q.font_color_name}' ({q.font_color_hex})")
        # Prints the question details: the displayed word vs the actual font color

        print(f"     Options: {q.options}")
        # Prints the 4 answer options
        
        # Simulate correct answer
        result = engine.validate_answer(q, q.font_color_name, random.randint(300, 1500), i)
        # Simulates a correct answer with a random reaction time between 300-1500ms

        print(f"     -> Points: {result.points_earned} | Combo: {result.combo} | Multiplier: {result.multiplier}x")
        # Prints the scoring result: points earned, combo streak, and multiplier

        print()
    
    print("--- Session Test (Endless) ---")
    # Header for the session integration test

    session = GameSession('endless')
    # Creates a new Endless mode game session with 3 lives

    for i in range(8):
        # Simulates 8 rounds of gameplay

        q = session.next_question()
        # Gets the next question

        if not q:
            break
            # Stops if the session ended (all lives lost)

        # Alternate correct/wrong for testing
        answer = q.font_color_name if i % 3 != 0 else 'WrongColor'
        # Simulates alternating correct and wrong answers (wrong every 3rd round)

        result = session.submit_answer(answer, random.randint(200, 2000))
        # Submits the answer with a random reaction time

        status = 'OK' if result['correct'] else 'X'
        # Status indicator: 'OK' for correct, 'X' for wrong

        print(f"  Round {i+1}: {status} | "
              f"Score:{result['score']} | Points:{result['total_points']} | "
              f"Lives:{result['lives']} | Combo:{result['combo']}")
        # Prints a summary of each round's results
    
    report = session.get_final_report()
    # Generates the final performance report

    print(f"\nFinal Report: {json.dumps(report, indent=2)}")
    # Prints the full report as formatted JSON
