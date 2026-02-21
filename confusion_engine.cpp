/**
 * Color Confusion — C++ High-Performance Ranking Engine
 * 
 * Processes leaderboard data, calculates percentiles,
 * and assigns performance ratings based on reaction times
 * and scores. Designed for server-side batch processing.
 * 
 * Compile: g++ -std=c++17 -O2 -o confusion_engine confusion_engine.cpp
 * Run:     ./confusion_engine
 */

#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <numeric>
#include <cmath>
#include <map>
#include <sstream>
#include <iomanip>

// ── Data Structures ──────────────────────────────────────────

struct PlayerScore {
    std::string username;
    std::string mode;       // "endless", "survival", "speed"
    int totalPoints;
    int correctAnswers;
    int maxCombo;
    double avgReactionMs;
    double elapsedSeconds;
    std::string rating;
};

struct RankEntry {
    int rank;
    std::string username;
    int totalPoints;
    double avgReactionMs;
    std::string rating;
    double percentile;
};

// ── Performance Rating Calculator ────────────────────────────

class PerformanceRater {
public:
    /**
     * Assign a cognitive performance rating based on Stroop test metrics.
     * Rating tiers reflect actual cognitive processing speed benchmarks.
     */
    static std::string getPerformanceRating(double avgReactionMs, int score) {
        if (avgReactionMs < 400 && score > 50)  return "Legendary";
        if (avgReactionMs < 500 && score > 40)  return "Grandmaster";
        if (avgReactionMs < 600 && score > 30)  return "Master";
        if (avgReactionMs < 700 && score > 25)  return "Expert";
        if (avgReactionMs < 800 && score > 20)  return "Advanced";
        if (avgReactionMs < 1000 && score > 15) return "Proficient";
        if (avgReactionMs < 1200 && score > 10) return "Intermediate";
        if (avgReactionMs < 1500 && score > 5)  return "Beginner";
        return "Trainee";
    }

    /**
     * Get a numerical rating score (0-100) for comparative analysis.
     */
    static double getNumericalRating(double avgReactionMs, int score, int maxCombo) {
        // Speed component (0-40 points): faster = better
        double speedScore = std::max(0.0, 40.0 * (1.0 - (avgReactionMs / 2000.0)));
        
        // Accuracy/score component (0-35 points)
        double scorePoints = std::min(35.0, score * 0.7);
        
        // Combo component (0-25 points): consistency bonus
        double comboPoints = std::min(25.0, maxCombo * 2.5);
        
        return std::min(100.0, speedScore + scorePoints + comboPoints);
    }
};

// ── Leaderboard Ranker ───────────────────────────────────────

class StroopRanker {
private:
    std::vector<PlayerScore> scores;
    
public:
    void addScore(const PlayerScore& score) {
        scores.push_back(score);
    }
    
    /**
     * Rank all players by total points (descending).
     * For ties, use average reaction time (ascending = faster is better).
     */
    std::vector<RankEntry> getRankings(const std::string& modeFilter = "") const {
        // Filter by mode if specified
        std::vector<PlayerScore> filtered;
        for (const auto& s : scores) {
            if (modeFilter.empty() || s.mode == modeFilter) {
                filtered.push_back(s);
            }
        }
        
        // Sort: higher points first, then faster reaction time
        std::sort(filtered.begin(), filtered.end(), [](const PlayerScore& a, const PlayerScore& b) {
            if (a.totalPoints != b.totalPoints)
                return a.totalPoints > b.totalPoints;
            return a.avgReactionMs < b.avgReactionMs;
        });
        
        std::vector<RankEntry> rankings;
        int totalPlayers = static_cast<int>(filtered.size());
        
        for (int i = 0; i < totalPlayers; ++i) {
            const auto& player = filtered[i];
            double percentile = totalPlayers > 1
                ? ((totalPlayers - i - 1.0) / (totalPlayers - 1.0)) * 100.0
                : 100.0;
            
            rankings.push_back({
                i + 1,
                player.username,
                player.totalPoints,
                player.avgReactionMs,
                player.rating,
                percentile
            });
        }
        
        return rankings;
    }
    
    /**
     * Calculate the percentile rank for a specific player's score.
     * Returns what percentage of players they outperform.
     */
    double calculatePercentile(int playerPoints) const {
        if (scores.empty()) return 100.0;
        
        int belowCount = 0;
        for (const auto& s : scores) {
            if (s.totalPoints < playerPoints) belowCount++;
        }
        return (static_cast<double>(belowCount) / scores.size()) * 100.0;
    }
    
    /**
     * Get statistical summary of all scores.
     */
    struct Stats {
        double meanScore;
        double medianScore;
        double meanReactionMs;
        double stdDevScore;
        int totalGames;
    };
    
    Stats getStatistics() const {
        Stats stats = {0, 0, 0, 0, static_cast<int>(scores.size())};
        if (scores.empty()) return stats;
        
        // Calculate means
        double sumPoints = 0, sumRT = 0;
        std::vector<int> allPoints;
        
        for (const auto& s : scores) {
            sumPoints += s.totalPoints;
            sumRT += s.avgReactionMs;
            allPoints.push_back(s.totalPoints);
        }
        
        stats.meanScore = sumPoints / scores.size();
        stats.meanReactionMs = sumRT / scores.size();
        
        // Median
        std::sort(allPoints.begin(), allPoints.end());
        int mid = allPoints.size() / 2;
        stats.medianScore = (allPoints.size() % 2 == 0)
            ? (allPoints[mid-1] + allPoints[mid]) / 2.0
            : allPoints[mid];
        
        // Standard deviation
        double sumSquaredDiff = 0;
        for (int p : allPoints) {
            sumSquaredDiff += (p - stats.meanScore) * (p - stats.meanScore);
        }
        stats.stdDevScore = std::sqrt(sumSquaredDiff / scores.size());
        
        return stats;
    }
    
    /**
     * Output formatted leaderboard to console.
     */
    void printLeaderboard(const std::string& mode = "") const {
        auto rankings = getRankings(mode);
        
        std::string title = mode.empty() ? "ALL MODES" : mode;
        std::transform(title.begin(), title.end(), title.begin(), ::toupper);
        
        std::cout << "\n╔═══════════════════════════════════════════════════════════════╗" << std::endl;
        std::cout << "║           COLOR CONFUSION LEADERBOARD — " << std::setw(12) << title << "         ║" << std::endl;
        std::cout << "╠═════╦═══════════════════╦════════╦══════════╦════════╦════════╣" << std::endl;
        std::cout << "║ #   ║ Player            ║ Points ║ Avg RT   ║ Rating ║ %ile   ║" << std::endl;
        std::cout << "╠═════╬═══════════════════╬════════╬══════════╬════════╬════════╣" << std::endl;
        
        for (const auto& r : rankings) {
            std::cout << "║ " << std::setw(3) << r.rank << " ║ "
                      << std::setw(17) << std::left << r.username << " ║ "
                      << std::setw(6) << std::right << r.totalPoints << " ║ "
                      << std::setw(6) << std::fixed << std::setprecision(0) << r.avgReactionMs << "ms ║ "
                      << std::setw(6) << std::left << r.rating.substr(0, 6) << " ║ "
                      << std::setw(5) << std::right << std::fixed << std::setprecision(1) << r.percentile << "% ║"
                      << std::endl;
        }
        
        std::cout << "╚═════╩═══════════════════╩════════╩══════════╩════════╩════════╝" << std::endl;
    }
};

// ── Scoring Calculator ───────────────────────────────────────

class ScoringEngine {
public:
    /**
     * Calculate points for a single correct answer.
     * 
     * @param reactionTimeMs  Time taken to answer in milliseconds
     * @param currentCombo    Current streak count
     * @param difficulty      Current difficulty level (1-5)
     * @return                Points earned for this answer
     */
    static int calculatePoints(int reactionTimeMs, int currentCombo, int difficulty) {
        int basePoints = 10;
        
        // Speed bonus: faster answers earn more (max +20 for <200ms)
        int speedBonus = std::max(0, (2000 - reactionTimeMs) / 100);
        
        // Combo multiplier: each streak adds 10%
        double comboMultiplier = 1.0 + (currentCombo * 0.1);
        
        // Difficulty bonus: harder levels earn more
        double difficultyBonus = 1.0 + (difficulty - 1) * 0.15;
        
        return static_cast<int>(
            std::round((basePoints + speedBonus) * comboMultiplier * difficultyBonus)
        );
    }
    
    /**
     * Calculate coins earned from a game session.
     * 1 coin per 100 points earned.
     */
    static int calculateCoins(int totalPoints) {
        return totalPoints / 100;
    }
    
    /**
     * Calculate stars earned from a game session.
     * 1 star per 10 correct answers.
     */
    static int calculateStars(int correctAnswers) {
        return correctAnswers / 10;
    }
};

// ── Main — Demo ──────────────────────────────────────────────

int main() {
    std::cout << "=== Color Confusion C++ Engine ===" << std::endl;
    std::cout << "High-performance ranking and scoring system\n" << std::endl;
    
    // Create ranker with sample player data
    StroopRanker ranker;
    
    ranker.addScore({"CipherMaster",  "endless",  1240, 42, 15, 520.0,  120.5, "Expert"});
    ranker.addScore({"NexusBrain",    "endless",  1120, 38, 12, 680.0,  95.3,  "Advanced"});
    ranker.addScore({"QuantumMind",   "endless",  1580, 55, 22, 450.0,  180.2, "Grandmaster"});
    ranker.addScore({"MasterPlayer",  "endless",  950,  30, 8,  890.0,  75.0,  "Proficient"});
    ranker.addScore({"StroopKing",    "survival", 2100, 65, 28, 380.0,  60.0,  "Legendary"});
    ranker.addScore({"ColorNinja",    "survival", 1450, 48, 18, 550.0,  60.0,  "Expert"});
    ranker.addScore({"BrainWave",     "speed",    1800, 50, 20, 420.0,  45.0,  "Master"});
    ranker.addScore({"SpeedDemon",    "speed",    1650, 50, 16, 480.0,  38.0,  "Expert"});
    
    // Show full leaderboard
    ranker.printLeaderboard();
    
    // Show mode-specific leaderboards
    ranker.printLeaderboard("endless");
    ranker.printLeaderboard("survival");
    ranker.printLeaderboard("speed");
    
    // Statistics
    auto stats = ranker.getStatistics();
    std::cout << "\n--- Global Statistics ---" << std::endl;
    std::cout << "Total Games: " << stats.totalGames << std::endl;
    std::cout << "Mean Score:  " << std::fixed << std::setprecision(1) << stats.meanScore << std::endl;
    std::cout << "Median:      " << stats.medianScore << std::endl;
    std::cout << "Std Dev:     " << stats.stdDevScore << std::endl;
    std::cout << "Mean RT:     " << stats.meanReactionMs << "ms" << std::endl;
    
    // Scoring demo
    std::cout << "\n--- Scoring Engine Demo ---" << std::endl;
    std::vector<std::pair<int, int>> testCases = {{300, 5}, {600, 3}, {1200, 1}, {1800, 0}};
    for (auto& [rt, combo] : testCases) {
        int pts = ScoringEngine::calculatePoints(rt, combo, 3);
        std::cout << "  RT=" << rt << "ms, Combo=" << combo 
                  << " → " << pts << " points" << std::endl;
    }
    
    // Performance ratings
    std::cout << "\n--- Performance Ratings ---" << std::endl;
    std::cout << "  450ms / 45 correct → " << PerformanceRater::getPerformanceRating(450, 45) << std::endl;
    std::cout << "  700ms / 22 correct → " << PerformanceRater::getPerformanceRating(700, 22) << std::endl;
    std::cout << "  1100ms / 12 correct → " << PerformanceRater::getPerformanceRating(1100, 12) << std::endl;
    
    // Numerical rating
    double numRating = PerformanceRater::getNumericalRating(500, 35, 12);
    std::cout << "\n  Numerical Rating (500ms, 35 score, 12 combo): " 
              << std::fixed << std::setprecision(1) << numRating << "/100" << std::endl;
    
    return 0;
}
