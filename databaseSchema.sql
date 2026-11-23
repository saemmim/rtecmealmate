-- =============================================
-- RTEC MEAL MATE
-- PostgreSQL Database Schema
-- =============================================


-- =============================================
-- 1. USERS
-- =============================================
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,

    name            VARCHAR(100),

    username        VARCHAR(50) NOT NULL,

    department      VARCHAR(50),

    batch           NUMERIC,

    email           VARCHAR(255) NOT NULL,

    phone           VARCHAR(11) NOT NULL,

    profile_picture     TEXT,

    password_hash   VARCHAR(255) NOT NULL,

    role            VARCHAR(4) NOT NULL DEFAULT 'user'
                    CHECK (
                        role IN (
                            'user',
                            'hr',
                            'hs'
                        )
                    ),

    status          VARCHAR(8) NOT NULL DEFAULT 'pending'
                    CHECK (
                        status IN (
                            'pending',
                            'approved',
                            'banned',
                            'deleted',
                            'archived'
                        )
                    ),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at      TIMESTAMPTZ
);


-- ---------------------------------------------
-- Partial unique indexes
-- Allows username/email/phone to be reused
-- after a user is soft-deleted.
-- ---------------------------------------------

CREATE UNIQUE INDEX unique_username_active
    ON users (username)
    WHERE status <> 'deleted';


CREATE UNIQUE INDEX unique_email_active
    ON users (email)
    WHERE status <> 'deleted';


CREATE UNIQUE INDEX unique_phone_active
    ON users (phone)
    WHERE status <> 'deleted';



-- =============================================
-- 2. Batches
-- =============================================
-- Stores batch information.
-- Batch numbers and names should be unique.
-- Batch status can be 'open', 'closed', or 'archived'.
-- Open means account creation is allowed. And appear on lists.
-- Closed means account creation is not allowed. But still appear on lists.
-- Archived means account creation is not allowed. And does not appear on lists.
-- =============================================

CREATE TABLE batches (
    id          BIGSERIAL PRIMARY KEY,
    batch       NUMERIC UNIQUE,
    name        VARCHAR(20),
    status      VARCHAR(10) CHECK (status IN ('open', 'archived', 'deleted'))
);



-- Batch numbers should be unique, names should be unique
CREATE UNIQUE INDEX unique_batch
    ON batches (batch);
CREATE UNIQUE INDEX unique_batch_name
    ON batches (name);



-- =============================================
-- 3. MANAGERS
-- =============================================
-- Stores temporary MM (Meal Manager) assignments.
-- Unlike HR/HS roles, manager assignments expire
-- and therefore have a period and status.
-- =============================================

CREATE TABLE managers (
    id              BIGSERIAL PRIMARY KEY,

    user_id         BIGINT NOT NULL
                    REFERENCES users(id),

    period          CHAR(7) NOT NULL
                    CHECK (
                        period ~ '^\d{4}-(0[1-9]|1[0-2])$'
                    ),

    status          VARCHAR(16) NOT NULL DEFAULT 'open'
                    CHECK (
                        status IN (
                            'open',
                            'closed',
                            'reopened',
                            'reopen'
                            'close'
                        )
                    ),

    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at      TIMESTAMPTZ
);


CREATE INDEX idx_managers_user_id
    ON managers(user_id);


CREATE INDEX idx_managers_status
    ON managers(status);


-- One manager assignment per user per month.
CREATE UNIQUE INDEX unique_manager_user_period
    ON managers(user_id, period);



-- =============================================
-- 4. MEALS
-- =============================================
CREATE TABLE meals (
    id              BIGSERIAL PRIMARY KEY,

    user_id         BIGINT NOT NULL
                    REFERENCES users(id),

    meal_date       DATE NOT NULL,

    guest           BOOLEAN NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Only one normal (non-guest) meal
-- per user per day.
CREATE UNIQUE INDEX unique_normal_meal_per_day
    ON meals (user_id, meal_date)
    WHERE guest = FALSE;


CREATE INDEX idx_meals_user_id
    ON meals(user_id);


CREATE INDEX idx_meals_meal_date
    ON meals(meal_date);



-- =============================================
-- 5. DEPOSITS
-- =============================================
CREATE TABLE deposits (
    id              BIGSERIAL PRIMARY KEY,

    user_id         BIGINT NOT NULL
                    REFERENCES users(id),

    amount          DECIMAL(12,2) NOT NULL,

    period          CHAR(7) NOT NULL
                    CHECK (
                        period ~ '^\d{4}-(0[1-9]|1[0-2])$'
                    ),

    collected_by    BIGINT NOT NULL
                    REFERENCES users(id),

    note            TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX idx_deposits_user_id
    ON deposits(user_id);


CREATE INDEX idx_deposits_period
    ON deposits(period);


-- Optional future index:
-- CREATE INDEX idx_deposits_collected_by
--     ON deposits(collected_by);



-- =============================================
-- 6. RECEIPTS
-- =============================================
CREATE TABLE receipts (
    id              BIGSERIAL PRIMARY KEY,

    user_id         BIGINT NOT NULL
                    REFERENCES users(id),

    receipt_date    DATE NOT NULL,

    image_url       TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at      TIMESTAMPTZ
);


CREATE INDEX idx_receipts_receipt_date
    ON receipts(receipt_date);


-- Optional future index:
-- CREATE INDEX idx_receipts_user_id
--     ON receipts(user_id);



-- =============================================
-- 7. RECEIPT ITEMS
-- =============================================
CREATE TABLE receipt_items (
    id              BIGSERIAL PRIMARY KEY,

    receipt_id      BIGINT NOT NULL
                    REFERENCES receipts(id),

    description     TEXT,

    price           DECIMAL(12,2) NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at      TIMESTAMPTZ
);


CREATE INDEX idx_receipt_items_receipt_id
    ON receipt_items(receipt_id);



-- =============================================
-- 8. BULLETINS
-- =============================================
CREATE TABLE bulletins (
    id              BIGSERIAL PRIMARY KEY,

    user_id         BIGINT NOT NULL
                    REFERENCES users(id),
    
    user_role       VARCHAR(2) NOT NULL DEFAULT 'mm'
                    CHECK (
                        user_role IN (
                            'mm',
                            'hr',
                            'hs'
                        )
                    ),


    title           VARCHAR(255),

    message         TEXT NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at      TIMESTAMPTZ
);


-- Optional future index:
-- CREATE INDEX idx_bulletins_user_id
--     ON bulletins(user_id);



-- =============================================
-- 9. MEAL CONFIGURATIONS
-- =============================================
CREATE TABLE meal_config (
    id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

    meal_lock_offset        VARCHAR(7) NOT NULL
                            CHECK (meal_lock_offset ~ '^[+-]?\d{2}:\d{2}$'),

    temp_meal_lock_offset   VARCHAR(7) DEFAULT NULL
                            CHECK (
                                temp_meal_lock_offset IS NULL OR
                                temp_meal_lock_offset ~ '^[+-]?\d{2}:\d{2}$'
                            ),

    last_execution_date     VARCHAR(10) NOT NULL DEFAULT '2026-12-01'
                            CHECK (last_execution_date ~ '^\d{4}-\d{2}-\d{2}$'),

    expected_meal_rate      DECIMAL(12,2) DEFAULT NULL
);
