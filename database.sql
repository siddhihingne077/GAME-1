-- Database Schema for Memory Master
-- This can be used for PostgreSQL or MySQL
-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(100) UNIQUE,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL UNIQUE,
    coins INTEGER DEFAULT 0,
    stars INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Create Game Progress Table
CREATE TABLE IF NOT EXISTS game_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    -- 'memory', 'f1', 'schulte', 'confusion'
    score FLOAT DEFAULT 0.0,
    level INTEGER DEFAULT 1,
    extra_data TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Create Rewards Table
CREATE TABLE IF NOT EXISTS rewards (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    cost_coins INTEGER NOT NULL,
    cost_stars INTEGER DEFAULT 0
);
-- Initial Mock Rewards
INSERT INTO rewards (name, description, cost_coins, cost_stars)
VALUES (
        'Double Coins Boost',
        'Earn double coins for 1 hour',
        500,
        0
    ),
    (
        'Golden Frame',
        'A special frame for your avatar',
        1000,
        10
    ),
    (
        'Instant Level Up',
        'Skip one level in Room Observer',
        2000,
        5
    );