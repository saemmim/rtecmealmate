-- ============================================================
-- RTEC MEAL MATE
-- DUMMY DATA POPULATION SCRIPT
-- ============================================================
--
-- DATA PERIOD:
--   2026-06
--   2026-07
--   2026-08
--   2026-09
--   2026-10
--
-- USERS:
--   100 users
--   25 users per batch
--
-- PERMANENT ROLES:
--   2 HR per batch
--   No HS
--
-- MANAGERS:
--   4 MM per batch per month
--
-- MANAGER STATUS:
--   2026-06 -> closed
--   2026-07 -> closed
--   2026-08 -> closed
--   2026-09 -> closed
--   2026-10 -> open
--
-- MEALS:
--   Every user has meals in EVERY month
--   Approximately 50-80% of days
--   Guest meals approximately 1%
--
-- DEPOSITS:
--   2-4 per user/month
--   ৳1,500 - ৳4,000
--   Collector = same-batch MM
--
-- BULLETINS:
--   Approximately 15-20 per month
--   Authors = HR/MM
--
-- RECEIPTS:
--   No dummy data
--
-- ============================================================



-- ============================================================
-- 0. OPTIONAL RESET
-- ============================================================
--
-- Uncomment this section ONLY if you want to remove
-- existing data before generating fresh dummy data.
--
-- TRUNCATE TABLE
--     bulletins,
--     deposits,
--     receipt_items,
--     receipts,
--     meals,
--     managers,
--     users
-- RESTART IDENTITY CASCADE;



-- ============================================================
-- 1. USERS
-- ============================================================
-- 100 users
-- 25 per batch
-- ============================================================

INSERT INTO users (
    name,
    username,
    department,
    batch,
    email,
    phone,
    password_hash,
    role,
    status
)
SELECT
    user_data.name,

    LOWER(
        regexp_replace(
            user_data.name,
            '[^a-zA-Z0-9]',
            '',
            'g'
        )
    )
    || '_' ||
    LPAD(user_no::TEXT, 3, '0'),

    (
        ARRAY[
            'YE',
            'FE',
            'WPE',
            'AE'
        ]
    )[1 + FLOOR(RANDOM() * 4)::INT],

    CASE
        WHEN user_no <= 25 THEN '1st'
        WHEN user_no <= 50 THEN '2nd'
        WHEN user_no <= 75 THEN '3rd'
        ELSE '4th'
    END,

    LOWER(
        regexp_replace(
            user_data.name,
            '[^a-zA-Z0-9]',
            '',
            'g'
        )
    )
    || user_no
    || '@example.com',

    '01' ||
    (
        ARRAY[
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
            '9'
        ]
    )[1 + FLOOR(RANDOM() * 7)::INT]
    ||
    LPAD(
        (1000000 + user_no * 7919)::TEXT,
        8,
        '0'
    ),

    '$2b$10$MLct2yYAzGxyYVA22QBC/OoULr3eJU0F7T0J0YtOZp.MiMfwzpGeG',

    'user',

    CASE
        -- HR candidates are kept approved.
        WHEN user_no IN (
            1, 2,
            26, 27,
            51, 52,
            76, 77
        )
        THEN 'approved'

        ELSE
            (
                ARRAY[
                    'pending',
                    'approved',
                    'banned',
                    'deleted'
                ]
            )[1 + FLOOR(RANDOM() * 4)::INT]
    END

FROM generate_series(1, 100) AS gs(user_no)

CROSS JOIN LATERAL (
    SELECT
        (
            ARRAY[
                'Abdullah Al Mamun',
                'Abdullah Al Noman',
                'Abdullah Al Mahmud',
                'Abu Sayed',
                'Ahsan Habib',
                'Aminul Islam',
                'Anik Hasan',
                'Arif Hossain',
                'Asif Rahman',
                'Atikur Rahman',
                'Azizul Haque',
                'Badrul Alam',
                'Belal Hossain',
                'Emon Ahmed',
                'Fahim Hasan',
                'Farhan Ahmed',
                'Fardin Islam',
                'Hasan Mahmud',
                'Imran Hossain',
                'Jahid Hasan',
                'Jamal Uddin',
                'Jasim Uddin',
                'Mahfuz Rahman',
                'Mahmudul Hasan',
                'Masud Rana',
                'Mehedi Hasan',
                'Minhaj Uddin',
                'Mizanur Rahman',
                'Monir Hossain',
                'Mostafizur Rahman',
                'Naim Hasan',
                'Nazmul Hasan',
                'Nayeem Islam',
                'Omar Faruk',
                'Rakib Hasan',
                'Rashedul Islam',
                'Rashedul Karim',
                'Riyad Hossain',
                'Robiul Islam',
                'Sabbir Ahmed',
                'Sajid Hasan',
                'Sakib Ahmed',
                'Salman Hossain',
                'Samiul Hasan',
                'Shakil Ahmed',
                'Shawon Ahmed',
                'Sohel Rana',
                'Tanvir Ahmed',
                'Tareq Rahman',
                'Towhidul Islam',
                'Zahid Hasan',
                'Zubair Ahmed',
                'Adnan Hossain',
                'Akram Hossain',
                'Al Amin',
                'Alif Hasan',
                'Ashikur Rahman',
                'Asif Mahmud',
                'Bashir Ahmed',
                'Dipu Hasan',
                'Faisal Ahmed',
                'Foysal Ahmed',
                'Habibullah Khan',
                'Hafizur Rahman',
                'Hafizur Rahman',
                'Hasibul Hasan',
                'Himel Ahmed',
                'Iqbal Hossain',
                'Ismail Hossain',
                'Jony Ahmed',
                'Kamal Hossain',
                'Kawsar Ahmed',
                'Khairul Islam',
                'Mahadi Hasan',
                'Mahbub Alam',
                'Mamunur Rashid',
                'Maruf Hasan',
                'Moinul Islam',
                'Mokhlesur Rahman',
                'Morshed Alam',
                'Nahid Hasan',
                'Nasir Uddin',
                'Nazrul Islam',
                'Noman Ahmed',
                'Parvez Hossain',
                'Rafsan Ahmed',
                'Rahim Uddin',
                'Raihan Kabir',
                'Rasel Ahmed',
                'Rashed Khan',
                'Ridwan Hasan',
                'Rifat Hossain',
                'Rony Ahmed',
                'Saiful Islam',
                'Sakibul Hasan',
                'Shahriar Hossain',
                'Shamim Ahmed',
                'Shihab Hasan',
                'Sohanur Rahman',
                'Sumon Hossain',
                'Tawhid Ahmed'
            ]
        )[user_no] AS name
) AS user_data;



-- ============================================================
-- 2. HR USERS
-- ============================================================
-- 2 HR per batch
--
-- 1st -> 1,2
-- 2nd -> 26,27
-- 3rd -> 51,52
-- 4th -> 76,77
-- ============================================================

UPDATE users
SET role = 'hr'
WHERE id IN (
    1, 2,
    26, 27,
    51, 52,
    76, 77
);



-- ============================================================
-- 3. MANAGERS
-- ============================================================
-- 4 MM per batch per month.
--
-- 2026-06 -> closed
-- 2026-07 -> closed
-- 2026-08 -> closed
-- 2026-09 -> closed
-- 2026-10 -> open
--
-- A user may be MM for multiple months.
-- ============================================================

WITH months AS (
    SELECT *
    FROM (
        VALUES
            ('2026-06', 'closed'),
            ('2026-07', 'closed'),
            ('2026-08', 'closed'),
            ('2026-09', 'closed'),
            ('2026-10', 'open')
    ) AS m(period, manager_status)
),

candidate_users AS (
    SELECT
        u.id,
        u.batch,
        m.period,
        m.manager_status,

        ROW_NUMBER() OVER (
            PARTITION BY
                u.batch,
                m.period

            ORDER BY
                CASE
                    WHEN
                        u.role = 'user'
                        AND u.status = 'approved'
                    THEN 0
                    ELSE 1
                END,
                RANDOM()
        ) AS rn

    FROM users u
    CROSS JOIN months m
)

INSERT INTO managers (
    user_id,
    period,
    status
)
SELECT
    id,
    period,
    manager_status

FROM candidate_users

WHERE rn <= 4;



-- ============================================================
-- 4. NORMAL MEALS
-- ============================================================
--
-- IMPORTANT:
-- Every user MUST have meals in EVERY month.
--
-- Target:
--   approximately 50-80% of days.
--
-- We guarantee a minimum of 5 meal days per user/month,
-- then randomly generate the remaining meal days.
--
-- This prevents the possibility of a user having zero
-- meals in a month.
-- ============================================================

WITH months AS (
    SELECT
        month_start,
        (
            month_start
            + INTERVAL '1 month'
            - INTERVAL '1 day'
        )::DATE AS month_end

    FROM (
        VALUES
            (DATE '2026-06-01'),
            (DATE '2026-07-01'),
            (DATE '2026-08-01'),
            (DATE '2026-09-01'),
            (DATE '2026-10-01')
    ) AS m(month_start)
),

user_months AS (
    SELECT
        u.id AS user_id,
        m.month_start,
        m.month_end,

        -- Random target between 50% and 80%.
        0.50 + RANDOM() * 0.30
            AS meal_probability

    FROM users u
    CROSS JOIN months m
),

calendar_days AS (
    SELECT
        um.user_id,
        um.month_start,
        um.month_end,
        um.meal_probability,
        day_date::DATE AS meal_date

    FROM user_months um

    CROSS JOIN LATERAL generate_series(
        um.month_start,
        um.month_end,
        INTERVAL '1 day'
    ) AS days(day_date)
),

selected_days AS (
    SELECT
        *,
        RANDOM() AS random_value

    FROM calendar_days
),

initial_meals AS (
    SELECT
        user_id,
        meal_date,
        month_start

    FROM selected_days

    WHERE random_value < meal_probability
),

guaranteed_users AS (
    SELECT
        user_id,
        month_start

    FROM user_months
),

guaranteed_meals AS (
    SELECT DISTINCT ON (
        gu.user_id,
        gu.month_start
    )
        gu.user_id,
        cd.meal_date,
        gu.month_start

    FROM guaranteed_users gu

    JOIN calendar_days cd
        ON cd.user_id = gu.user_id
        AND cd.month_start = gu.month_start

    ORDER BY
        gu.user_id,
        gu.month_start,
        RANDOM()
)

INSERT INTO meals (
    user_id,
    meal_date,
    guest
)
SELECT
    user_id,
    meal_date,
    FALSE

FROM initial_meals

UNION

SELECT
    user_id,
    meal_date,
    FALSE

FROM guaranteed_meals;



-- ============================================================
-- 5. GUEST MEALS
-- ============================================================
--
-- Approximately 1%.
--
-- Guest meals can ONLY be created where a normal meal
-- already exists.
-- ============================================================

INSERT INTO meals (
    user_id,
    meal_date,
    guest
)
SELECT
    m.user_id,
    m.meal_date,
    TRUE

FROM meals m

WHERE
    m.guest = FALSE

    AND RANDOM() < 0.01;



-- ============================================================
-- 6. DEPOSITS
-- ============================================================
--
-- 2-4 deposits per user per month.
--
-- Amount:
--   1,500 - 4,000
--
-- Collector:
--   MM
--   same batch
--   same month
-- ============================================================

WITH months AS (
    SELECT period
    FROM (
        VALUES
            ('2026-06'),
            ('2026-07'),
            ('2026-08'),
            ('2026-09'),
            ('2026-10')
    ) AS m(period)
),

user_months AS (
    SELECT
        u.id AS user_id,
        u.batch,
        m.period,

        (
            2 + FLOOR(RANDOM() * 3)
        )::INT AS deposit_count

    FROM users u
    CROSS JOIN months m
),

deposit_rows AS (
    SELECT
        um.user_id,
        um.batch,
        um.period,
        gs.deposit_no

    FROM user_months um

    CROSS JOIN LATERAL generate_series(
        1,
        um.deposit_count
    ) AS gs(deposit_no)
)

INSERT INTO deposits (
    user_id,
    amount,
    period,
    collected_by,
    note,
    created_at
)
SELECT
    dr.user_id,

    ROUND(
        (
            1500
            + RANDOM() * 2500
        )::NUMERIC,
        2
    ),

    dr.period,

    collector.user_id,

    CASE
        WHEN dr.deposit_no = 1
            THEN 'Monthly meal deposit'

        WHEN dr.deposit_no = 2
            THEN 'Additional meal deposit'

        ELSE
            'Additional deposit'
    END,

    (
        TO_DATE(
            dr.period || '-01',
            'YYYY-MM-DD'
        )
        +
        FLOOR(
            RANDOM() *
            EXTRACT(
                DAY FROM (
                    DATE_TRUNC(
                        'month',
                        TO_DATE(
                            dr.period || '-01',
                            'YYYY-MM-DD'
                        )
                    )
                    + INTERVAL '1 month - 1 day'
                )
            )
        )::INT
        +
        RANDOM() * INTERVAL '23 hours 59 minutes'
    )

FROM deposit_rows dr

CROSS JOIN LATERAL (

    SELECT
        m.user_id

    FROM managers m

    JOIN users collector
        ON collector.id = m.user_id

    WHERE
        m.period = dr.period

        AND m.status IN (
            'open',
            'closed'
        )

        AND collector.batch = dr.batch

    ORDER BY RANDOM()

    LIMIT 1

) AS collector;



-- ============================================================
-- 7. BULLETINS
-- ============================================================
--
-- Approximately 15-20 per month.
--
-- Authors:
--   HR
--   MM
-- ============================================================

WITH months AS (
    SELECT period
    FROM (
        VALUES
            ('2026-06'),
            ('2026-07'),
            ('2026-08'),
            ('2026-09'),
            ('2026-10')
    ) AS m(period)
),

bulletin_counts AS (
    SELECT
        period,
        (
            15 + FLOOR(RANDOM() * 6)
        )::INT AS bulletin_count

    FROM months
),

bulletin_rows AS (
    SELECT
        bc.period,
        gs.bulletin_no

    FROM bulletin_counts bc

    CROSS JOIN LATERAL generate_series(
        1,
        bc.bulletin_count
    ) AS gs(bulletin_no)
)

INSERT INTO bulletins (
    user_id,
    title,
    message,
    created_at
)
SELECT
    author.user_id,

    CASE
        WHEN br.bulletin_no % 10 = 0
            THEN 'Important Meal Update'

        WHEN br.bulletin_no % 10 = 1
            THEN 'Monthly Deposit Notice'

        WHEN br.bulletin_no % 10 = 2
            THEN 'Meal Count Reminder'

        WHEN br.bulletin_no % 10 = 3
            THEN 'Hostel Meal Notice'

        WHEN br.bulletin_no % 10 = 4
            THEN 'Monthly Meal Information'

        WHEN br.bulletin_no % 10 = 5
            THEN 'Deposit Collection Update'

        WHEN br.bulletin_no % 10 = 6
            THEN 'General Notice'

        WHEN br.bulletin_no % 10 = 7
            THEN 'Meal Management Notice'

        WHEN br.bulletin_no % 10 = 8
            THEN 'Important Announcement'

        ELSE
            'Monthly Reminder'
    END,

    CASE
        WHEN br.bulletin_no % 10 = 0
            THEN
                'Please check your meal information and make sure your meal count is updated correctly.'

        WHEN br.bulletin_no % 10 = 1
            THEN
                'Please make your monthly meal deposit within the scheduled collection period.'

        WHEN br.bulletin_no % 10 = 2
            THEN
                'All users are requested to review their meal status and update it when necessary.'

        WHEN br.bulletin_no % 10 = 3
            THEN
                'A general hostel meal-related update has been posted for all residents.'

        WHEN br.bulletin_no % 10 = 4
            THEN
                'Please review your monthly meal information from the dashboard.'

        WHEN br.bulletin_no % 10 = 5
            THEN
                'The monthly deposit collection process is currently ongoing.'

        WHEN br.bulletin_no % 10 = 6
            THEN
                'Please check the dashboard regularly for important updates.'

        WHEN br.bulletin_no % 10 = 7
            THEN
                'Please review the latest meal management information from the dashboard.'

        WHEN br.bulletin_no % 10 = 8
            THEN
                'This is an important announcement from the meal management team.'

        ELSE
            'Please keep your meal information updated throughout the month.'
    END,

    (
        TO_DATE(
            br.period || '-01',
            'YYYY-MM-DD'
        )
        +
        FLOOR(
            RANDOM() *
            EXTRACT(
                DAY FROM (
                    DATE_TRUNC(
                        'month',
                        TO_DATE(
                            br.period || '-01',
                            'YYYY-MM-DD'
                        )
                    )
                    + INTERVAL '1 month - 1 day'
                )
            )
        )::INT
        +
        RANDOM() * INTERVAL '23 hours 59 minutes'
    )

FROM bulletin_rows br

CROSS JOIN LATERAL (

    SELECT
        u.id AS user_id

    FROM users u

    WHERE
        u.role = 'hr'

        OR EXISTS (
            SELECT 1

            FROM managers m

            WHERE
                m.user_id = u.id

                AND m.period = br.period

                AND m.status IN (
                    'open',
                    'closed'
                )
        )

    ORDER BY RANDOM()

    LIMIT 1

) AS author;



-- ============================================================
-- 8. VERIFICATION QUERIES
-- ============================================================


-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------

SELECT
    batch,
    role,
    status,
    COUNT(*) AS total

FROM users

GROUP BY
    batch,
    role,
    status

ORDER BY
    batch,
    role,
    status;



-- ------------------------------------------------------------
-- HR COUNT BY BATCH
-- ------------------------------------------------------------

SELECT
    batch,
    COUNT(*) AS hr_count

FROM users

WHERE role = 'hr'

GROUP BY batch

ORDER BY
    CASE batch
        WHEN '1st' THEN 1
        WHEN '2nd' THEN 2
        WHEN '3rd' THEN 3
        WHEN '4th' THEN 4
    END;



-- ------------------------------------------------------------
-- MM COUNT BY MONTH AND BATCH
-- ------------------------------------------------------------

SELECT
    m.period,
    u.batch,
    COUNT(*) AS mm_count

FROM managers m

JOIN users u
    ON u.id = m.user_id

GROUP BY
    m.period,
    u.batch

ORDER BY
    m.period,
    CASE u.batch
        WHEN '1st' THEN 1
        WHEN '2nd' THEN 2
        WHEN '3rd' THEN 3
        WHEN '4th' THEN 4
    END;



-- ------------------------------------------------------------
-- MANAGER STATUS
-- ------------------------------------------------------------

SELECT
    period,
    status,
    COUNT(*) AS total

FROM managers

GROUP BY
    period,
    status

ORDER BY
    period;



-- ------------------------------------------------------------
-- VERIFY EVERY USER HAS MEALS IN EVERY MONTH
-- ------------------------------------------------------------

SELECT
    u.id,
    u.name,
    months.period,
    COUNT(m.id) AS meal_count

FROM users u

CROSS JOIN (
    VALUES
        ('2026-06'),
        ('2026-07'),
        ('2026-08'),
        ('2026-09'),
        ('2026-10')
) AS months(period)

LEFT JOIN meals m
    ON m.user_id = u.id
    AND TO_CHAR(m.meal_date, 'YYYY-MM') = months.period

GROUP BY
    u.id,
    u.name,
    months.period

HAVING COUNT(m.id) = 0

ORDER BY
    u.id,
    months.period;



-- If this query returns ZERO ROWS,
-- every user has at least one meal in every month.



-- ------------------------------------------------------------
-- MEAL SUMMARY
-- ------------------------------------------------------------

SELECT
    TO_CHAR(meal_date, 'YYYY-MM') AS period,

    COUNT(*) FILTER (
        WHERE guest = FALSE
    ) AS normal_meals,

    COUNT(*) FILTER (
        WHERE guest = TRUE
    ) AS guest_meals,

    COUNT(DISTINCT user_id) AS users

FROM meals

GROUP BY
    TO_CHAR(meal_date, 'YYYY-MM')

ORDER BY
    period;



-- ------------------------------------------------------------
-- MEALS PER USER PER MONTH
-- ------------------------------------------------------------

SELECT
    TO_CHAR(m.meal_date, 'YYYY-MM') AS period,

    ROUND(
        AVG(
            monthly_meals.meal_count
        ),
        2
    ) AS avg_meals_per_user

FROM meals m

JOIN LATERAL (
    SELECT
        COUNT(*) AS meal_count

    FROM meals x

    WHERE
        x.user_id = m.user_id
        AND x.guest = FALSE
        AND TO_CHAR(
            x.meal_date,
            'YYYY-MM'
        ) = TO_CHAR(
            m.meal_date,
            'YYYY-MM'
        )

) AS monthly_meals
ON TRUE

GROUP BY
    TO_CHAR(m.meal_date, 'YYYY-MM')

ORDER BY
    period;



-- ------------------------------------------------------------
-- DEPOSIT SUMMARY
-- ------------------------------------------------------------

SELECT
    period,
    COUNT(*) AS deposit_count,
    COUNT(DISTINCT user_id) AS users,
    ROUND(SUM(amount), 2) AS total_deposit

FROM deposits

GROUP BY period

ORDER BY period;



-- ------------------------------------------------------------
-- VERIFY DEPOSIT COLLECTOR BATCH
-- ------------------------------------------------------------

SELECT
    d.period,

    user_account.batch AS user_batch,

    collector.batch AS collector_batch,

    COUNT(*) AS deposit_count

FROM deposits d

JOIN users user_account
    ON user_account.id = d.user_id

JOIN users collector
    ON collector.id = d.collected_by

GROUP BY
    d.period,
    user_account.batch,
    collector.batch

ORDER BY
    d.period,
    user_account.batch;



-- ------------------------------------------------------------
-- BULLETIN SUMMARY
-- ------------------------------------------------------------

SELECT
    TO_CHAR(
        created_at,
        'YYYY-MM'
    ) AS period,

    COUNT(*) AS bulletin_count

FROM bulletins

GROUP BY
    TO_CHAR(
        created_at,
        'YYYY-MM'
    )

ORDER BY period;



-- ------------------------------------------------------------
-- VERIFY BULLETIN AUTHORS
-- ------------------------------------------------------------

SELECT
    u.role,
    COUNT(*) AS bulletin_count

FROM bulletins b

JOIN users u
    ON u.id = b.user_id

GROUP BY
    u.role

ORDER BY
    u.role;