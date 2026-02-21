<<<<<<< HEAD
/**
 * Color Confusion — Java Game Engine
 * 
 * Question validation, combo tracking, and session analysis
 * for the Stroop Effect cognitive test.
 * 
 * Compile: javac ConfusionEngine.java
 * Run:     java ConfusionEngine
 */

import java.util.*;
import java.util.stream.Collectors;

public class ConfusionEngine {

    // ── Color Registry ───────────────────────────────────────

    static final Map<String, String> COLORS = new LinkedHashMap<>() {{
        put("Red",      "#ef4444");
        put("Blue",     "#3b82f6");
        put("Green",    "#22c55e");
        put("Yellow",   "#eab308");
        put("Purple",   "#8b5cf6");
        put("Orange",   "#f97316");
        put("Pink",     "#ff29ff");
        put("Cyan",     "#06b6d4");
        put("Indigo",   "#6366f1");
        put("Violet",   "#8b5cf6");
        put("Black",    "#1a1a1a");
        put("Brown",    "#78350f");
        put("Lavender", "#a78bfa");
        put("White",    "#ffffff");
        put("Beige",    "#f5f5dc");
    }};

    // ── Stroop Question ──────────────────────────────────────

    static class StroopQuestion {
        String textWord;         // The word displayed (e.g., "YELLOW")
        String fontColorName;    // The actual font color (e.g., "Red") — correct answer
        String fontColorHex;     // Hex code for the font color
        List<String> options;    // 4 answer choices
        long timestamp;

        StroopQuestion(String textWord, String fontColorName, String fontColorHex, List<String> options) {
            this.textWord = textWord;
            this.fontColorName = fontColorName;
            this.fontColorHex = fontColorHex;
            this.options = options;
            this.timestamp = System.currentTimeMillis();
        }

        @Override
        public String toString() {
            return String.format("Word='%s' FontColor='%s' Options=%s", textWord, fontColorName, options);
        }
    }

    // ── Stroop Validator ─────────────────────────────────────

    static class StroopValidator {
        private final Random random = new Random();
        private List<String> colorPool;

        StroopValidator(int difficulty) {
            this.colorPool = getColorPoolForDifficulty(difficulty);
        }

        private List<String> getColorPoolForDifficulty(int difficulty) {
            List<String> allColors = new ArrayList<>(COLORS.keySet());
            int count = Math.min(allColors.size(), 4 + (difficulty - 1) * 2);
            return allColors.subList(0, count);
        }

        /**
         * Generate a Stroop question ensuring the word and font color mismatch.
         */
        StroopQuestion generateQuestion() {
            String fontColor = colorPool.get(random.nextInt(colorPool.size()));

            // Pick a different word to create the Stroop effect
            List<String> wordCandidates = colorPool.stream()
                .filter(c -> !c.equals(fontColor))
                .collect(Collectors.toList());
            String textWord = wordCandidates.isEmpty() ? "Black"
                : wordCandidates.get(random.nextInt(wordCandidates.size()));

            // Build 4 options
            List<String> distractors = colorPool.stream()
                .filter(c -> !c.equals(fontColor) && !c.equals(textWord))
                .collect(Collectors.toList());
            Collections.shuffle(distractors);

            List<String> options = new ArrayList<>();
            options.add(fontColor);
            for (int i = 0; i < 3 && i < distractors.size(); i++) {
                options.add(distractors.get(i));
            }
            // Fill up to 4 if needed
            List<String> allColors = new ArrayList<>(COLORS.keySet());
            while (options.size() < 4) {
                String filler = allColors.get(random.nextInt(allColors.size()));
                if (!options.contains(filler)) options.add(filler);
            }
            Collections.shuffle(options);

            return new StroopQuestion(
                textWord.toUpperCase(),
                fontColor,
                COLORS.getOrDefault(fontColor, "#888"),
                options
            );
        }

        /**
         * Validate an answer against the correct font color.
         */
        boolean validateAnswer(StroopQuestion question, String selectedColor) {
            return question.fontColorName.equalsIgnoreCase(selectedColor);
        }

        void setDifficulty(int difficulty) {
            this.colorPool = getColorPoolForDifficulty(difficulty);
        }
    }

    // ── Combo Tracker ────────────────────────────────────────

    static class ComboTracker {
        private int currentCombo = 0;
        private int maxCombo = 0;
        private int totalCorrect = 0;
        private int totalWrong = 0;

        /**
         * Record a correct answer — increments combo.
         */
        void recordCorrect() {
            currentCombo++;
            totalCorrect++;
            maxCombo = Math.max(maxCombo, currentCombo);
        }

        /**
         * Record a wrong answer — resets combo to 0.
         */
        void recordWrong() {
            currentCombo = 0;
            totalWrong++;
        }

        int getCurrentCombo()  { return currentCombo; }
        int getMaxCombo()      { return maxCombo; }
        int getTotalCorrect()  { return totalCorrect; }
        int getTotalWrong()    { return totalWrong; }
        int getTotalAnswers()  { return totalCorrect + totalWrong; }

        /**
         * Get combo multiplier (1.0 base + 0.1 per streak).
         */
        double getMultiplier() {
            return 1.0 + (currentCombo * 0.1);
        }

        /**
         * Get accuracy percentage.
         */
        double getAccuracy() {
            int total = getTotalAnswers();
            return total > 0 ? (totalCorrect * 100.0 / total) : 0.0;
        }

        @Override
        public String toString() {
            return String.format("Combo:%d (Max:%d) | Correct:%d Wrong:%d | Accuracy:%.1f%%",
                currentCombo, maxCombo, totalCorrect, totalWrong, getAccuracy());
        }
    }

    // ── Session Analyzer ─────────────────────────────────────

    static class SessionAnalyzer {
        private final List<Long> reactionTimes = new ArrayList<>();
        private final ComboTracker comboTracker;
        private int totalPoints = 0;
        private long sessionStartMs;

        SessionAnalyzer(ComboTracker tracker) {
            this.comboTracker = tracker;
            this.sessionStartMs = System.currentTimeMillis();
        }

        void recordReaction(long reactionTimeMs) {
            reactionTimes.add(reactionTimeMs);
        }

        void addPoints(int points) {
            totalPoints += points;
        }

        /**
         * Calculate average reaction time in milliseconds.
         */
        double getAverageReactionTime() {
            if (reactionTimes.isEmpty()) return 0;
            return reactionTimes.stream().mapToLong(Long::longValue).average().orElse(0);
        }

        /**
         * Get the fastest reaction time recorded.
         */
        long getFastestReaction() {
            return reactionTimes.stream().mapToLong(Long::longValue).min().orElse(0);
        }

        /**
         * Get the slowest reaction time recorded.
         */
        long getSlowestReaction() {
            return reactionTimes.stream().mapToLong(Long::longValue).max().orElse(0);
        }

        /**
         * Calculate points for a single correct answer.
         */
        int calculatePoints(long reactionTimeMs, int combo, int difficulty) {
            int basePoints = 10;
            int speedBonus = Math.max(0, (int) ((2000 - reactionTimeMs) / 100));
            double multiplier = 1.0 + (combo * 0.1);
            double diffBonus = 1.0 + (difficulty - 1) * 0.15;
            return (int) Math.round((basePoints + speedBonus) * multiplier * diffBonus);
        }

        /**
         * Assign performance rating.
         */
        String getPerformanceRating() {
            double avgRT = getAverageReactionTime();
            int score = comboTracker.getTotalCorrect();

            if (avgRT < 400 && score > 50)  return "Legendary";
            if (avgRT < 500 && score > 40)  return "Grandmaster";
            if (avgRT < 600 && score > 30)  return "Master";
            if (avgRT < 700 && score > 25)  return "Expert";
            if (avgRT < 800 && score > 20)  return "Advanced";
            if (avgRT < 1000 && score > 15) return "Proficient";
            if (avgRT < 1200 && score > 10) return "Intermediate";
            if (avgRT < 1500 && score > 5)  return "Beginner";
            return "Trainee";
        }

        /**
         * Generate a full session report.
         */
        Map<String, Object> generateReport() {
            double elapsedSec = (System.currentTimeMillis() - sessionStartMs) / 1000.0;
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("totalPoints", totalPoints);
            report.put("correctAnswers", comboTracker.getTotalCorrect());
            report.put("wrongAnswers", comboTracker.getTotalWrong());
            report.put("maxCombo", comboTracker.getMaxCombo());
            report.put("accuracy", String.format("%.1f%%", comboTracker.getAccuracy()));
            report.put("avgReactionMs", String.format("%.0f", getAverageReactionTime()));
            report.put("fastestReactionMs", getFastestReaction());
            report.put("slowestReactionMs", getSlowestReaction());
            report.put("totalQuestions", comboTracker.getTotalAnswers());
            report.put("elapsedSeconds", String.format("%.2f", elapsedSec));
            report.put("rating", getPerformanceRating());
            return report;
        }
    }

    // ── Main — Demo ──────────────────────────────────────────

    public static void main(String[] args) {
        System.out.println("=== Color Confusion Java Engine ===\n");
        Random random = new Random();

        // Set up game components
        StroopValidator validator = new StroopValidator(3);
        ComboTracker combo = new ComboTracker();
        SessionAnalyzer analyzer = new SessionAnalyzer(combo);

        System.out.println("--- Generating 8 Stroop Questions ---\n");

        for (int i = 0; i < 8; i++) {
            StroopQuestion q = validator.generateQuestion();
            System.out.printf("Q%d: %s%n", i + 1, q);

            // Simulate: 70% chance correct
            boolean isCorrect = random.nextDouble() < 0.7;
            String answer = isCorrect ? q.fontColorName : "WrongColor";
            long reactionTime = 200 + random.nextInt(1800);

            boolean valid = validator.validateAnswer(q, answer);
            analyzer.recordReaction(reactionTime);

            if (valid) {
                combo.recordCorrect();
                int points = analyzer.calculatePoints(reactionTime, combo.getCurrentCombo(), 3);
                analyzer.addPoints(points);
                System.out.printf("    ✓ Correct! RT=%dms → %d points (Combo x%d, Mult %.1fx)%n",
                    reactionTime, points, combo.getCurrentCombo(), combo.getMultiplier());
            } else {
                combo.recordWrong();
                System.out.printf("    ✗ Wrong! RT=%dms (Combo reset)%n", reactionTime);
            }
        }

        // Print results
        System.out.println("\n--- Session Analyzer Report ---");
        System.out.println(combo);

        Map<String, Object> report = analyzer.generateReport();
        System.out.println("\nFinal Report:");
        for (Map.Entry<String, Object> entry : report.entrySet()) {
            System.out.printf("  %-20s : %s%n", entry.getKey(), entry.getValue());
        }
    }
}
=======
/**
 * Color Confusion — Java Game Engine
 * 
 * Question validation, combo tracking, and session analysis
 * for the Stroop Effect cognitive test.
 * 
 * Compile: javac ConfusionEngine.java
 * Run:     java ConfusionEngine
 */

import java.util.*;
import java.util.stream.Collectors;

public class ConfusionEngine {

    // ── Color Registry ───────────────────────────────────────

    static final Map<String, String> COLORS = new LinkedHashMap<>() {{
        put("Red",      "#ef4444");
        put("Blue",     "#3b82f6");
        put("Green",    "#22c55e");
        put("Yellow",   "#eab308");
        put("Purple",   "#8b5cf6");
        put("Orange",   "#f97316");
        put("Pink",     "#ff29ff");
        put("Cyan",     "#06b6d4");
        put("Indigo",   "#6366f1");
        put("Violet",   "#8b5cf6");
        put("Black",    "#1a1a1a");
        put("Brown",    "#78350f");
        put("Lavender", "#a78bfa");
        put("White",    "#ffffff");
        put("Beige",    "#f5f5dc");
    }};

    // ── Stroop Question ──────────────────────────────────────

    static class StroopQuestion {
        String textWord;         // The word displayed (e.g., "YELLOW")
        String fontColorName;    // The actual font color (e.g., "Red") — correct answer
        String fontColorHex;     // Hex code for the font color
        List<String> options;    // 4 answer choices
        long timestamp;

        StroopQuestion(String textWord, String fontColorName, String fontColorHex, List<String> options) {
            this.textWord = textWord;
            this.fontColorName = fontColorName;
            this.fontColorHex = fontColorHex;
            this.options = options;
            this.timestamp = System.currentTimeMillis();
        }

        @Override
        public String toString() {
            return String.format("Word='%s' FontColor='%s' Options=%s", textWord, fontColorName, options);
        }
    }

    // ── Stroop Validator ─────────────────────────────────────

    static class StroopValidator {
        private final Random random = new Random();
        private List<String> colorPool;

        StroopValidator(int difficulty) {
            this.colorPool = getColorPoolForDifficulty(difficulty);
        }

        private List<String> getColorPoolForDifficulty(int difficulty) {
            List<String> allColors = new ArrayList<>(COLORS.keySet());
            int count = Math.min(allColors.size(), 4 + (difficulty - 1) * 2);
            return allColors.subList(0, count);
        }

        /**
         * Generate a Stroop question ensuring the word and font color mismatch.
         */
        StroopQuestion generateQuestion() {
            String fontColor = colorPool.get(random.nextInt(colorPool.size()));

            // Pick a different word to create the Stroop effect
            List<String> wordCandidates = colorPool.stream()
                .filter(c -> !c.equals(fontColor))
                .collect(Collectors.toList());
            String textWord = wordCandidates.isEmpty() ? "Black"
                : wordCandidates.get(random.nextInt(wordCandidates.size()));

            // Build 4 options
            List<String> distractors = colorPool.stream()
                .filter(c -> !c.equals(fontColor) && !c.equals(textWord))
                .collect(Collectors.toList());
            Collections.shuffle(distractors);

            List<String> options = new ArrayList<>();
            options.add(fontColor);
            for (int i = 0; i < 3 && i < distractors.size(); i++) {
                options.add(distractors.get(i));
            }
            // Fill up to 4 if needed
            List<String> allColors = new ArrayList<>(COLORS.keySet());
            while (options.size() < 4) {
                String filler = allColors.get(random.nextInt(allColors.size()));
                if (!options.contains(filler)) options.add(filler);
            }
            Collections.shuffle(options);

            return new StroopQuestion(
                textWord.toUpperCase(),
                fontColor,
                COLORS.getOrDefault(fontColor, "#888"),
                options
            );
        }

        /**
         * Validate an answer against the correct font color.
         */
        boolean validateAnswer(StroopQuestion question, String selectedColor) {
            return question.fontColorName.equalsIgnoreCase(selectedColor);
        }

        void setDifficulty(int difficulty) {
            this.colorPool = getColorPoolForDifficulty(difficulty);
        }
    }

    // ── Combo Tracker ────────────────────────────────────────

    static class ComboTracker {
        private int currentCombo = 0;
        private int maxCombo = 0;
        private int totalCorrect = 0;
        private int totalWrong = 0;

        /**
         * Record a correct answer — increments combo.
         */
        void recordCorrect() {
            currentCombo++;
            totalCorrect++;
            maxCombo = Math.max(maxCombo, currentCombo);
        }

        /**
         * Record a wrong answer — resets combo to 0.
         */
        void recordWrong() {
            currentCombo = 0;
            totalWrong++;
        }

        int getCurrentCombo()  { return currentCombo; }
        int getMaxCombo()      { return maxCombo; }
        int getTotalCorrect()  { return totalCorrect; }
        int getTotalWrong()    { return totalWrong; }
        int getTotalAnswers()  { return totalCorrect + totalWrong; }

        /**
         * Get combo multiplier (1.0 base + 0.1 per streak).
         */
        double getMultiplier() {
            return 1.0 + (currentCombo * 0.1);
        }

        /**
         * Get accuracy percentage.
         */
        double getAccuracy() {
            int total = getTotalAnswers();
            return total > 0 ? (totalCorrect * 100.0 / total) : 0.0;
        }

        @Override
        public String toString() {
            return String.format("Combo:%d (Max:%d) | Correct:%d Wrong:%d | Accuracy:%.1f%%",
                currentCombo, maxCombo, totalCorrect, totalWrong, getAccuracy());
        }
    }

    // ── Session Analyzer ─────────────────────────────────────

    static class SessionAnalyzer {
        private final List<Long> reactionTimes = new ArrayList<>();
        private final ComboTracker comboTracker;
        private int totalPoints = 0;
        private long sessionStartMs;

        SessionAnalyzer(ComboTracker tracker) {
            this.comboTracker = tracker;
            this.sessionStartMs = System.currentTimeMillis();
        }

        void recordReaction(long reactionTimeMs) {
            reactionTimes.add(reactionTimeMs);
        }

        void addPoints(int points) {
            totalPoints += points;
        }

        /**
         * Calculate average reaction time in milliseconds.
         */
        double getAverageReactionTime() {
            if (reactionTimes.isEmpty()) return 0;
            return reactionTimes.stream().mapToLong(Long::longValue).average().orElse(0);
        }

        /**
         * Get the fastest reaction time recorded.
         */
        long getFastestReaction() {
            return reactionTimes.stream().mapToLong(Long::longValue).min().orElse(0);
        }

        /**
         * Get the slowest reaction time recorded.
         */
        long getSlowestReaction() {
            return reactionTimes.stream().mapToLong(Long::longValue).max().orElse(0);
        }

        /**
         * Calculate points for a single correct answer.
         */
        int calculatePoints(long reactionTimeMs, int combo, int difficulty) {
            int basePoints = 10;
            int speedBonus = Math.max(0, (int) ((2000 - reactionTimeMs) / 100));
            double multiplier = 1.0 + (combo * 0.1);
            double diffBonus = 1.0 + (difficulty - 1) * 0.15;
            return (int) Math.round((basePoints + speedBonus) * multiplier * diffBonus);
        }

        /**
         * Assign performance rating.
         */
        String getPerformanceRating() {
            double avgRT = getAverageReactionTime();
            int score = comboTracker.getTotalCorrect();

            if (avgRT < 400 && score > 50)  return "Legendary";
            if (avgRT < 500 && score > 40)  return "Grandmaster";
            if (avgRT < 600 && score > 30)  return "Master";
            if (avgRT < 700 && score > 25)  return "Expert";
            if (avgRT < 800 && score > 20)  return "Advanced";
            if (avgRT < 1000 && score > 15) return "Proficient";
            if (avgRT < 1200 && score > 10) return "Intermediate";
            if (avgRT < 1500 && score > 5)  return "Beginner";
            return "Trainee";
        }

        /**
         * Generate a full session report.
         */
        Map<String, Object> generateReport() {
            double elapsedSec = (System.currentTimeMillis() - sessionStartMs) / 1000.0;
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("totalPoints", totalPoints);
            report.put("correctAnswers", comboTracker.getTotalCorrect());
            report.put("wrongAnswers", comboTracker.getTotalWrong());
            report.put("maxCombo", comboTracker.getMaxCombo());
            report.put("accuracy", String.format("%.1f%%", comboTracker.getAccuracy()));
            report.put("avgReactionMs", String.format("%.0f", getAverageReactionTime()));
            report.put("fastestReactionMs", getFastestReaction());
            report.put("slowestReactionMs", getSlowestReaction());
            report.put("totalQuestions", comboTracker.getTotalAnswers());
            report.put("elapsedSeconds", String.format("%.2f", elapsedSec));
            report.put("rating", getPerformanceRating());
            return report;
        }
    }

    // ── Main — Demo ──────────────────────────────────────────

    public static void main(String[] args) {
        System.out.println("=== Color Confusion Java Engine ===\n");
        Random random = new Random();

        // Set up game components
        StroopValidator validator = new StroopValidator(3);
        ComboTracker combo = new ComboTracker();
        SessionAnalyzer analyzer = new SessionAnalyzer(combo);

        System.out.println("--- Generating 8 Stroop Questions ---\n");

        for (int i = 0; i < 8; i++) {
            StroopQuestion q = validator.generateQuestion();
            System.out.printf("Q%d: %s%n", i + 1, q);

            // Simulate: 70% chance correct
            boolean isCorrect = random.nextDouble() < 0.7;
            String answer = isCorrect ? q.fontColorName : "WrongColor";
            long reactionTime = 200 + random.nextInt(1800);

            boolean valid = validator.validateAnswer(q, answer);
            analyzer.recordReaction(reactionTime);

            if (valid) {
                combo.recordCorrect();
                int points = analyzer.calculatePoints(reactionTime, combo.getCurrentCombo(), 3);
                analyzer.addPoints(points);
                System.out.printf("    ✓ Correct! RT=%dms → %d points (Combo x%d, Mult %.1fx)%n",
                    reactionTime, points, combo.getCurrentCombo(), combo.getMultiplier());
            } else {
                combo.recordWrong();
                System.out.printf("    ✗ Wrong! RT=%dms (Combo reset)%n", reactionTime);
            }
        }

        // Print results
        System.out.println("\n--- Session Analyzer Report ---");
        System.out.println(combo);

        Map<String, Object> report = analyzer.generateReport();
        System.out.println("\nFinal Report:");
        for (Map.Entry<String, Object> entry : report.entrySet()) {
            System.out.printf("  %-20s : %s%n", entry.getKey(), entry.getValue());
        }
    }
}
>>>>>>> 741fb699d582a9e19c7dce04ba1e68aa05c7d813
