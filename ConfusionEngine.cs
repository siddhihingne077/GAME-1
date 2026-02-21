/**
 * Color Confusion — C# Game Session Manager
 * 
 * State machine for managing Endless, Survival, and Speed Run modes.
 * Centralized scoring, session lifecycle, and result generation.
 * 
 * Build:  dotnet build  (or csc ConfusionEngine.cs)
 * Run:    dotnet run     (or ./ConfusionEngine)
 */

using System;
using System.Collections.Generic;
using System.Linq;

namespace ColorConfusion
{
    // ── Color Registry ───────────────────────────────────────

    public static class ColorRegistry
    {
        public static readonly Dictionary<string, string> Colors = new()
        {
            { "Red",      "#ef4444" },
            { "Blue",     "#3b82f6" },
            { "Green",    "#22c55e" },
            { "Yellow",   "#eab308" },
            { "Purple",   "#8b5cf6" },
            { "Orange",   "#f97316" },
            { "Pink",     "#ff29ff" },
            { "Cyan",     "#06b6d4" },
            { "Indigo",   "#6366f1" },
            { "Violet",   "#8b5cf6" },
            { "Black",    "#1a1a1a" },
            { "Brown",    "#78350f" },
            { "Lavender", "#a78bfa" },
            { "White",    "#ffffff" },
            { "Beige",    "#f5f5dc" },
        };

        /// <summary>
        /// Returns the color pool for a given difficulty level (1-5).
        /// Higher difficulty = more colors to choose from.
        /// </summary>
        public static List<string> GetColorPool(int difficulty)
        {
            int count = Math.Min(Colors.Count, 4 + (difficulty - 1) * 2);
            return Colors.Keys.Take(count).ToList();
        }
    }

    // ── Game Mode Enum ───────────────────────────────────────

    public enum GameMode
    {
        Endless,    // 3 lives, play until out
        Survival,   // 60s timer, +3s correct / -3s wrong
        SpeedRun    // Race to 50 correct answers
    }

    // ── Game State Enum ──────────────────────────────────────

    public enum GameState
    {
        Idle,       // Waiting to start
        Active,     // Playing
        Paused,     // Paused (future use)
        Finished    // Game over
    }

    // ── Stroop Question ──────────────────────────────────────

    public class StroopQuestion
    {
        public string TextWord { get; set; } = "";
        public string FontColorName { get; set; } = "";
        public string FontColorHex { get; set; } = "";
        public List<string> Options { get; set; } = new();

        public override string ToString() =>
            $"Word='{TextWord}' FontColor='{FontColorName}' Options=[{string.Join(", ", Options)}]";
    }

    // ── Score Calculator ─────────────────────────────────────

    public static class ScoreCalculator
    {
        /// <summary>
        /// Calculate points for a correct answer with combo and speed bonuses.
        /// </summary>
        public static int CalculatePoints(int reactionTimeMs, int currentCombo, int difficulty)
        {
            int basePoints = 10;
            int speedBonus = Math.Max(0, (2000 - reactionTimeMs) / 100);
            double comboMultiplier = 1.0 + (currentCombo * 0.1);
            double difficultyBonus = 1.0 + (difficulty - 1) * 0.15;

            return (int)Math.Round((basePoints + speedBonus) * comboMultiplier * difficultyBonus);
        }

        /// <summary>
        /// Calculate coins earned (1 per 100 points).
        /// </summary>
        public static int CalculateCoins(int totalPoints) => totalPoints / 100;

        /// <summary>
        /// Calculate stars earned (1 per 10 correct answers).
        /// </summary>
        public static int CalculateStars(int correctAnswers) => correctAnswers / 10;
    }

    // ── Session Result ───────────────────────────────────────

    public class SessionResult
    {
        public GameMode Mode { get; set; }
        public int TotalPoints { get; set; }
        public int CorrectAnswers { get; set; }
        public int WrongAnswers { get; set; }
        public int MaxCombo { get; set; }
        public double AvgReactionMs { get; set; }
        public double FastestReaction { get; set; }
        public double SlowestReaction { get; set; }
        public double ElapsedSeconds { get; set; }
        public double Accuracy { get; set; }
        public string Rating { get; set; } = "Trainee";
        public int CoinsEarned { get; set; }
        public int StarsEarned { get; set; }

        /// <summary>
        /// Assign performance rating based on Stroop metrics.
        /// </summary>
        public void CalculateRating()
        {
            if (AvgReactionMs < 400 && CorrectAnswers > 50)       Rating = "Legendary";
            else if (AvgReactionMs < 500 && CorrectAnswers > 40)  Rating = "Grandmaster";
            else if (AvgReactionMs < 600 && CorrectAnswers > 30)  Rating = "Master";
            else if (AvgReactionMs < 700 && CorrectAnswers > 25)  Rating = "Expert";
            else if (AvgReactionMs < 800 && CorrectAnswers > 20)  Rating = "Advanced";
            else if (AvgReactionMs < 1000 && CorrectAnswers > 15) Rating = "Proficient";
            else if (AvgReactionMs < 1200 && CorrectAnswers > 10) Rating = "Intermediate";
            else if (AvgReactionMs < 1500 && CorrectAnswers > 5)  Rating = "Beginner";
            else Rating = "Trainee";
        }

        public override string ToString()
        {
            return $@"
╔══════════════════════════════════════════╗
║     COLOR CONFUSION — SESSION REPORT     ║
╠══════════════════════════════════════════╣
║  Mode:           {Mode,-24}║
║  Total Points:   {TotalPoints,-24}║
║  Correct:        {CorrectAnswers,-24}║
║  Wrong:          {WrongAnswers,-24}║
║  Accuracy:       {Accuracy:F1}%{new string(' ', 20 - Accuracy.ToString("F1").Length)}║
║  Max Combo:      {MaxCombo,-24}║
║  Avg Reaction:   {AvgReactionMs:F0}ms{new string(' ', 21 - AvgReactionMs.ToString("F0").Length)}║
║  Fastest:        {FastestReaction:F0}ms{new string(' ', 21 - FastestReaction.ToString("F0").Length)}║
║  Slowest:        {SlowestReaction:F0}ms{new string(' ', 21 - SlowestReaction.ToString("F0").Length)}║
║  Elapsed:        {ElapsedSeconds:F2}s{new string(' ', 22 - ElapsedSeconds.ToString("F2").Length)}║
║  Rating:         {Rating,-24}║
║  Coins Earned:   {CoinsEarned,-24}║
║  Stars Earned:   {StarsEarned,-24}║
╚══════════════════════════════════════════╝";
        }
    }

    // ── Game Session — State Machine ─────────────────────────

    public class GameSession
    {
        private readonly Random _random = new();
        private readonly List<long> _reactions = new();
        private List<string> _colorPool;

        // Session state
        public GameMode Mode { get; }
        public GameState State { get; private set; } = GameState.Idle;
        public int Score { get; private set; } = 0;
        public int TotalPoints { get; private set; } = 0;
        public int Combo { get; private set; } = 0;
        public int MaxCombo { get; private set; } = 0;
        public int Lives { get; private set; }
        public double TimeLeft { get; private set; }
        public int Target { get; private set; }
        public int Difficulty { get; private set; } = 1;
        public int WrongAnswers { get; private set; } = 0;
        public StroopQuestion? CurrentQuestion { get; private set; }
        public DateTime StartTime { get; private set; }

        public GameSession(GameMode mode)
        {
            Mode = mode;
            Lives = mode == GameMode.Endless ? 3 : -1;
            TimeLeft = mode == GameMode.Survival ? 60.0 : -1;
            Target = mode == GameMode.SpeedRun ? 50 : -1;
            _colorPool = ColorRegistry.GetColorPool(Difficulty);
        }

        /// <summary>Start the game session.</summary>
        public void Start()
        {
            State = GameState.Active;
            StartTime = DateTime.Now;
        }

        /// <summary>Generate the next Stroop question.</summary>
        public StroopQuestion? NextQuestion()
        {
            if (State != GameState.Active) return null;

            string fontColor = _colorPool[_random.Next(_colorPool.Count)];
            var wordCandidates = _colorPool.Where(c => c != fontColor).ToList();
            string textWord = wordCandidates.Count > 0
                ? wordCandidates[_random.Next(wordCandidates.Count)]
                : "Black";

            // Build options
            var distractors = _colorPool.Where(c => c != fontColor && c != textWord).ToList();
            distractors = distractors.OrderBy(_ => _random.Next()).ToList();

            var options = new List<string> { fontColor };
            options.AddRange(distractors.Take(3));

            while (options.Count < 4)
            {
                var filler = ColorRegistry.Colors.Keys.ElementAt(
                    _random.Next(ColorRegistry.Colors.Count));
                if (!options.Contains(filler)) options.Add(filler);
            }
            options = options.OrderBy(_ => _random.Next()).ToList();

            CurrentQuestion = new StroopQuestion
            {
                TextWord = textWord.ToUpper(),
                FontColorName = fontColor,
                FontColorHex = ColorRegistry.Colors.GetValueOrDefault(fontColor, "#888"),
                Options = options
            };

            return CurrentQuestion;
        }

        /// <summary>Submit an answer and get the result.</summary>
        public Dictionary<string, object> SubmitAnswer(string selectedColor, int reactionTimeMs)
        {
            if (State != GameState.Active || CurrentQuestion == null)
                return new Dictionary<string, object> { { "error", "No active question" } };

            _reactions.Add(reactionTimeMs);
            bool correct = CurrentQuestion.FontColorName.Equals(
                selectedColor, StringComparison.OrdinalIgnoreCase);

            int pointsEarned = 0;

            if (correct)
            {
                Score++;
                Combo++;
                MaxCombo = Math.Max(MaxCombo, Combo);
                pointsEarned = ScoreCalculator.CalculatePoints(reactionTimeMs, Combo, Difficulty);
                TotalPoints += pointsEarned;

                if (Mode == GameMode.Survival) TimeLeft += 3;
                if (Score % 5 == 0) ScaleDifficulty();
            }
            else
            {
                Combo = 0;
                WrongAnswers++;

                switch (Mode)
                {
                    case GameMode.Endless:
                        Lives--;
                        if (Lives <= 0) State = GameState.Finished;
                        break;
                    case GameMode.Survival:
                        TimeLeft = Math.Max(0, TimeLeft - 3);
                        if (TimeLeft <= 0) State = GameState.Finished;
                        break;
                    case GameMode.SpeedRun:
                        TotalPoints = Math.Max(0, TotalPoints - 5);
                        break;
                }
            }

            if (Mode == GameMode.SpeedRun && Score >= Target)
                State = GameState.Finished;

            return new Dictionary<string, object>
            {
                { "correct", correct },
                { "pointsEarned", pointsEarned },
                { "totalPoints", TotalPoints },
                { "score", Score },
                { "combo", Combo },
                { "maxCombo", MaxCombo },
                { "lives", Lives },
                { "timeLeft", Math.Round(TimeLeft, 1) },
                { "isActive", State == GameState.Active }
            };
        }

        private void ScaleDifficulty()
        {
            if (Score >= 40) Difficulty = 5;
            else if (Score >= 30) Difficulty = 4;
            else if (Score >= 20) Difficulty = 3;
            else if (Score >= 10) Difficulty = 2;
            else Difficulty = 1;
            _colorPool = ColorRegistry.GetColorPool(Difficulty);
        }

        /// <summary>Generate the final session report.</summary>
        public SessionResult GetFinalReport()
        {
            double elapsed = (DateTime.Now - StartTime).TotalSeconds;
            double avgRT = _reactions.Count > 0 ? _reactions.Average() : 0;
            int totalAnswers = Score + WrongAnswers;

            var result = new SessionResult
            {
                Mode = Mode,
                TotalPoints = TotalPoints,
                CorrectAnswers = Score,
                WrongAnswers = WrongAnswers,
                MaxCombo = MaxCombo,
                AvgReactionMs = avgRT,
                FastestReaction = _reactions.Count > 0 ? _reactions.Min() : 0,
                SlowestReaction = _reactions.Count > 0 ? _reactions.Max() : 0,
                ElapsedSeconds = elapsed,
                Accuracy = totalAnswers > 0 ? (Score * 100.0 / totalAnswers) : 0,
                CoinsEarned = ScoreCalculator.CalculateCoins(TotalPoints),
                StarsEarned = ScoreCalculator.CalculateStars(Score)
            };
            result.CalculateRating();
            return result;
        }
    }

    // ── Program Entry — Demo ─────────────────────────────────

    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("=== Color Confusion C# Engine ===\n");
            var random = new Random();

            // Test all three modes
            var modes = new[] { GameMode.Endless, GameMode.Survival, GameMode.SpeedRun };

            foreach (var mode in modes)
            {
                Console.WriteLine($"\n--- Testing {mode} Mode ---");
                var session = new GameSession(mode);
                session.Start();

                int rounds = mode == GameMode.SpeedRun ? 15 : 10;

                for (int i = 0; i < rounds; i++)
                {
                    var q = session.NextQuestion();
                    if (q == null) break;

                    bool shouldBeCorrect = random.NextDouble() < 0.7;
                    string answer = shouldBeCorrect ? q.FontColorName : "WrongColor";
                    int reactionTime = 200 + random.Next(1800);

                    var result = session.SubmitAnswer(answer, reactionTime);

                    bool correct = (bool)result["correct"];
                    Console.Write($"  R{i + 1}: {(correct ? "✓" : "✗")} ");
                    Console.Write($"Score:{result["score"]} Points:{result["totalPoints"]} ");
                    Console.Write($"Combo:{result["combo"]} ");

                    if (mode == GameMode.Endless)
                        Console.Write($"Lives:{result["lives"]}");
                    else if (mode == GameMode.Survival)
                        Console.Write($"Time:{result["timeLeft"]}s");

                    Console.WriteLine();

                    if (!(bool)result["isActive"])
                    {
                        Console.WriteLine("  >> GAME OVER");
                        break;
                    }
                }

                // Print report
                var report = session.GetFinalReport();
                Console.WriteLine(report);
            }
        }
    }
}
