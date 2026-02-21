"""
Color Confusion — Python Game Engine
Stroop Effect question generation, validation, and scoring logic.
Used by the Flask API to serve game data to the frontend.
"""

import random
import time
import json
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Tuple

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

# Difficulty tiers — more colors = harder
DIFFICULTY_TIERS = {
    1: ['Red', 'Blue', 'Green', 'Yellow'],
    2: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'],
    3: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Cyan'],
    4: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Cyan', 'Indigo', 'Violet'],
    5: list(COLORS.keys()),  # All colors
}


@dataclass
class StroopQuestion:
    """A single Stroop effect question."""
    text_word: str          # The word displayed (e.g., "YELLOW")
    font_color_name: str    # The actual font color name (e.g., "Red")
    font_color_hex: str     # Hex for the font color
    options: List[str]      # 4 answer choices
    difficulty: int         # Current difficulty level
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AnswerResult:
    """Result of a single answer validation."""
    correct: bool
    reaction_time_ms: int
    points_earned: int
    combo: int
    speed_bonus: int
    multiplier: float


class ConfusionEngine:
    """
    Core Stroop Effect game engine.
    
    Handles question generation, answer validation,
    scoring with combo multipliers, and difficulty scaling.
    """
    
    def __init__(self, difficulty: int = 1):
        self.difficulty = max(1, min(5, difficulty))
        self._color_pool = self._get_color_pool()
    
    def _get_color_pool(self) -> List[str]:
        """Get available colors based on difficulty."""
        tier = min(self.difficulty, max(DIFFICULTY_TIERS.keys()))
        return DIFFICULTY_TIERS.get(tier, DIFFICULTY_TIERS[1])
    
    def generate_question(self) -> StroopQuestion:
        """
        Generate a Stroop question where the displayed word
        and its font color are always different (the Stroop effect).
        """
        pool = self._color_pool
        
        # Pick the font color (this is the CORRECT answer)
        font_color_name = random.choice(pool)
        
        # Pick a DIFFERENT word to display (creates the Stroop effect)
        available_words = [c for c in pool if c != font_color_name]
        text_word = random.choice(available_words) if available_words else 'Black'
        
        # Build 4 options: correct + 3 distractors
        distractors = [c for c in pool if c != font_color_name and c != text_word]
        random.shuffle(distractors)
        options = [font_color_name] + distractors[:3]
        
        # Ensure we have exactly 4 options
        while len(options) < 4:
            filler = random.choice(list(COLORS.keys()))
            if filler not in options:
                options.append(filler)
        
        random.shuffle(options)
        
        return StroopQuestion(
            text_word=text_word.upper(),
            font_color_name=font_color_name,
            font_color_hex=COLORS.get(font_color_name, '#888'),
            options=options,
            difficulty=self.difficulty
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
        correct = selected_color.lower() == question.font_color_name.lower()
        
        if correct:
            combo = current_combo + 1
            base_points = 10
            speed_bonus = max(0, (2000 - reaction_time_ms) // 100)
            multiplier = 1.0 + (combo * 0.1)
            points = round((base_points + speed_bonus) * multiplier)
        else:
            combo = 0
            base_points = 0
            speed_bonus = 0
            multiplier = 1.0
            points = 0
        
        return AnswerResult(
            correct=correct,
            reaction_time_ms=reaction_time_ms,
            points_earned=points,
            combo=combo,
            speed_bonus=speed_bonus,
            multiplier=multiplier
        )
    
    def scale_difficulty(self, score: int) -> None:
        """Auto-scale difficulty based on score milestones."""
        if score >= 40:
            self.difficulty = 5
        elif score >= 30:
            self.difficulty = 4
        elif score >= 20:
            self.difficulty = 3
        elif score >= 10:
            self.difficulty = 2
        else:
            self.difficulty = 1
        self._color_pool = self._get_color_pool()
    
    def get_performance_rating(
        self,
        avg_reaction_ms: float,
        total_score: int
    ) -> str:
        """Assign a performance rating based on reaction time and score."""
        if avg_reaction_ms < 600 and total_score > 40:
            return "Grandmaster"
        elif avg_reaction_ms < 800 and total_score > 25:
            return "Expert"
        elif avg_reaction_ms < 1000 and total_score > 15:
            return "Advanced"
        elif avg_reaction_ms < 1200 and total_score > 8:
            return "Intermediate"
        elif total_score > 3:
            return "Beginner"
        else:
            return "Trainee"


# ── Session Manager ───────────────────────────────────────────

class GameSession:
    """
    Manages a complete Color Confusion game session.
    
    Modes:
    - endless:   3 lives, play until lives run out
    - survival:  60s timer, +3s correct / -3s wrong
    - speed:     race to 50 correct answers
    """
    
    def __init__(self, mode: str = 'endless'):
        self.mode = mode
        self.engine = ConfusionEngine(difficulty=1)
        self.score = 0
        self.total_points = 0
        self.combo = 0
        self.max_combo = 0
        self.lives = 3 if mode == 'endless' else -1
        self.time_left = 60.0 if mode == 'survival' else -1
        self.target = 50 if mode == 'speed' else -1
        self.reactions: List[int] = []
        self.start_time = time.time()
        self.is_active = True
        self.current_question: Optional[StroopQuestion] = None
    
    def next_question(self) -> Optional[StroopQuestion]:
        """Generate the next question if session is still active."""
        if not self.is_active:
            return None
        self.current_question = self.engine.generate_question()
        return self.current_question
    
    def submit_answer(self, selected_color: str, reaction_time_ms: int) -> dict:
        """Process an answer and return the result with updated session state."""
        if not self.is_active or not self.current_question:
            return {"error": "No active question"}
        
        result = self.engine.validate_answer(
            self.current_question, selected_color, reaction_time_ms, self.combo
        )
        
        self.reactions.append(reaction_time_ms)
        
        if result.correct:
            self.score += 1
            self.combo = result.combo
            self.max_combo = max(self.max_combo, self.combo)
            self.total_points += result.points_earned
            
            # Mode-specific rewards
            if self.mode == 'survival':
                self.time_left += 3
            
            # Difficulty scaling every 5 correct
            if self.score % 5 == 0:
                self.engine.scale_difficulty(self.score)
        else:
            self.combo = 0
            
            # Mode-specific penalties
            if self.mode == 'endless':
                self.lives -= 1
                if self.lives <= 0:
                    self.is_active = False
            elif self.mode == 'survival':
                self.time_left = max(0, self.time_left - 3)
                if self.time_left <= 0:
                    self.is_active = False
            elif self.mode == 'speed':
                self.total_points = max(0, self.total_points - 5)
        
        # Speed run win condition
        if self.mode == 'speed' and self.score >= self.target:
            self.is_active = False
        
        return {
            "correct": result.correct,
            "points_earned": result.points_earned,
            "total_points": self.total_points,
            "score": self.score,
            "combo": self.combo,
            "max_combo": self.max_combo,
            "lives": self.lives,
            "time_left": round(self.time_left, 1) if self.time_left >= 0 else -1,
            "is_active": self.is_active,
            "speed_bonus": result.speed_bonus,
            "multiplier": result.multiplier,
        }
    
    def get_final_report(self) -> dict:
        """Generate the end-of-session report."""
        elapsed = round(time.time() - self.start_time, 2)
        avg_rt = (
            round(sum(self.reactions) / len(self.reactions))
            if self.reactions else 0
        )
        rating = self.engine.get_performance_rating(avg_rt, self.score)
        
        return {
            "mode": self.mode,
            "total_points": self.total_points,
            "score": self.score,
            "max_combo": self.max_combo,
            "avg_reaction_ms": avg_rt,
            "elapsed_seconds": elapsed,
            "rating": rating,
            "total_questions": len(self.reactions),
            "accuracy": round(self.score / max(1, len(self.reactions)) * 100, 1),
        }


# ── CLI Test ──────────────────────────────────────────────────
if __name__ == '__main__':
    print("=== Color Confusion Engine Test ===\n")
    
    engine = ConfusionEngine(difficulty=2)
    
    for i in range(5):
        q = engine.generate_question()
        print(f"Q{i+1}: Word='{q.text_word}' | Font Color='{q.font_color_name}' ({q.font_color_hex})")
        print(f"     Options: {q.options}")
        
        # Simulate correct answer
        result = engine.validate_answer(q, q.font_color_name, random.randint(300, 1500), i)
        print(f"     -> Points: {result.points_earned} | Combo: {result.combo} | Multiplier: {result.multiplier}x")
        print()
    
    print("--- Session Test (Endless) ---")
    session = GameSession('endless')
    for i in range(8):
        q = session.next_question()
        if not q:
            break
        # Alternate correct/wrong for testing
        answer = q.font_color_name if i % 3 != 0 else 'WrongColor'
        result = session.submit_answer(answer, random.randint(200, 2000))
        status = 'OK' if result['correct'] else 'X'
        print(f"  Round {i+1}: {status} | "
              f"Score:{result['score']} | Points:{result['total_points']} | "
              f"Lives:{result['lives']} | Combo:{result['combo']}")
    
    report = session.get_final_report()
    print(f"\nFinal Report: {json.dumps(report, indent=2)}")
