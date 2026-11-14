-- ============================================================
-- AUTO POPULATE RECEIPTS + RECEIPT ITEMS
-- Period: 2026-06 to 2026-10
-- Users: 20-70
-- ============================================================

DO $$
DECLARE
    current_month        DATE;
    current_receipt_id   BIGINT;
    current_receipt_date DATE;
    current_user_id      BIGINT;

    receipt_count        INT;
    items_for_receipt    INT;

    receipt_counter      INT := 0;
    item_counter         INT := 0;

    i                    INT;
    j                    INT;

    item_name            TEXT;
    quantity             INT;
    item_price           DECIMAL(12,2);

    item_names TEXT[] := ARRAY[
        'Rice',
        'Miniket Rice',
        'Nazirshail Rice',
        'Lentil',
        'Mug Dal',
        'Masoor Dal',
        'Soybean Oil',
        'Mustard Oil',
        'Potato',
        'Onion',
        'Garlic',
        'Ginger',
        'Green Chili',
        'Tomato',
        'Egg',
        'Chicken',
        'Beef',
        'Fish',
        'Rohu Fish',
        'Tilapia Fish',
        'Pangash Fish',
        'Hilsa Fish',
        'Vegetables',
        'Cauliflower',
        'Cabbage',
        'Carrot',
        'Spinach',
        'Cucumber',
        'Brinjal',
        'Pumpkin',
        'Salt',
        'Sugar',
        'Spices',
        'Turmeric Powder',
        'Chili Powder',
        'Cumin Powder',
        'Coriander Powder',
        'Tea',
        'Milk',
        'Bread',
        'Biscuit',
        'Noodles',
        'Flour',
        'Chickpeas',
        'Peas'
    ];

BEGIN

    -- ========================================================
    -- June 2026 to October 2026
    -- ========================================================

    current_month := DATE '2026-06-01';

    WHILE current_month <= DATE '2026-10-01'
    LOOP

        -- ----------------------------------------------------
        -- Generate 100-150 receipts for this month
        -- ----------------------------------------------------

        receipt_count :=
            floor(random() * 51 + 100)::INT;


        FOR i IN 1..receipt_count
        LOOP

            -- ------------------------------------------------
            -- Random user ID: 20-70
            -- ------------------------------------------------

            current_user_id :=
                floor(random() * 51 + 20)::BIGINT;


            -- ------------------------------------------------
            -- Random date within current month
            -- ------------------------------------------------

            current_receipt_date :=
                current_month
                + floor(
                    random()
                    * (
                        EXTRACT(
                            DAY FROM (
                                current_month
                                + INTERVAL '1 month'
                                - INTERVAL '1 day'
                            )
                        )
                    )
                )::INT;


            receipt_counter := receipt_counter + 1;


            -- ------------------------------------------------
            -- Insert receipt
            -- ------------------------------------------------

            INSERT INTO receipts (
                user_id,
                receipt_date,
                image_url,
                created_at,
                updated_at
            )
            VALUES (
                current_user_id,

                current_receipt_date,

                'u_' || receipt_counter || '.webp',

                -- Random time on receipt date
                current_receipt_date
                + (
                    random()
                    * INTERVAL '23 hours 59 minutes'
                ),

                -- Approximately 10% have updated_at
                CASE
                    WHEN random() < 0.10 THEN
                        current_receipt_date
                        + INTERVAL '1 day'
                        + (
                            random()
                            * INTERVAL '20 days'
                        )
                    ELSE NULL
                END
            )
            RETURNING id
            INTO current_receipt_id;


            -- ------------------------------------------------
            -- Generate 1-6 items for this receipt
            -- ------------------------------------------------

            items_for_receipt :=
                floor(random() * 6 + 1)::INT;


            FOR j IN 1..items_for_receipt
            LOOP

                -- --------------------------------------------
                -- Random item
                -- --------------------------------------------

                item_name :=
                    item_names[
                        floor(
                            random()
                            * array_length(item_names, 1)
                        )::INT + 1
                    ];


                -- --------------------------------------------
                -- Random quantity: 1-20
                -- --------------------------------------------

                quantity :=
                    floor(random() * 20 + 1)::INT;


                -- --------------------------------------------
                -- Random price: 20.00 - 2000.00
                -- --------------------------------------------

                item_price :=
                    round(
                        (
                            random() * 1980 + 20
                        )::NUMERIC,
                        2
                    );


                item_counter := item_counter + 1;


                -- --------------------------------------------
                -- Insert receipt item
                -- --------------------------------------------

                INSERT INTO receipt_items (
                    receipt_id,
                    description,
                    price,
                    created_at,
                    updated_at
                )
                VALUES (
                    current_receipt_id,

                    item_name
                    || ' - '
                    || quantity
                    ||
                    CASE
                        WHEN item_name IN (
                            'Rice',
                            'Miniket Rice',
                            'Nazirshail Rice',
                            'Lentil',
                            'Mug Dal',
                            'Masoor Dal',
                            'Soybean Oil',
                            'Mustard Oil',
                            'Potato',
                            'Onion',
                            'Garlic',
                            'Ginger',
                            'Sugar',
                            'Flour'
                        )
                        THEN ' kg'

                        WHEN item_name = 'Milk'
                        THEN ' L'

                        ELSE ' pcs'
                    END,

                    item_price,

                    -- Random time on receipt date
                    current_receipt_date
                    + (
                        random()
                        * INTERVAL '23 hours 59 minutes'
                    ),

                    -- Approximately 10% updated_at
                    CASE
                        WHEN random() < 0.10 THEN
                            current_receipt_date
                            + INTERVAL '1 day'
                            + (
                                random()
                                * INTERVAL '20 days'
                            )
                        ELSE NULL
                    END
                );

            END LOOP;

        END LOOP;


        -- ----------------------------------------------------
        -- Move to next month
        -- ----------------------------------------------------

        current_month :=
            current_month + INTERVAL '1 month';

    END LOOP;


    RAISE NOTICE
        'Created % receipts and % receipt items.',
        receipt_counter,
        item_counter;

END $$;