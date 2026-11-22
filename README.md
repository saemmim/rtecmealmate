# rtecmealmate
A full-stack web app to assist with meal-related activities for RTEC Boys Hostel.

## Context
Once upon a time, there was a boy studying at Rangpur Textile Engineering College. He was enjoying his hostel life. Yet one thing kept whispering in his mind: the meal management system was not efficient enough. How could this process be digitized? This project is the result of that thought.

## What it does
This project helps meal managers of RTEC Boys Hostel easily manage users, count meals, track records, and monitor expenses for each month. It automates a significant portion of the tasks related to meal management.

## Technical Aspects

### User Roles
To properly maintain meal records and other administrative tasks, four types of user roles have been implemented:

1. Normal Users
2. Meal Managers
3. Hall Representatives
4. Hostel Super

#### Normal Users
They can:
- Turn on/off their meals for a particular day
- Turn meals on/off for any number of guests if needed
- View all their meals for each month
- View all their transactions for each month
- View shopping receipts added by managers
- View news bulletins
- View individuals serving different roles for clarity

#### Meal Managers
Meal managers are assigned on a monthly basis by hall representatives. They only have access to their particular month’s dashboard and can only work with that month.  
They can:
- View batch-wise total number of meals for a particular day
- View total meals per day for that month
- Add money for users of their respective batch
- View and add shopping receipts
- View total expenses and deposits for that month
- View and add news bulletins

#### Hall Representatives
Hall representatives are assigned by the Hostel Super. They have no expiry date. The Hostel Super can add or remove them from the role when needed. Representatives are selected batch-wise and only have access for their particular batch.  
They can:
- View, add, and remove meal managers for different months from their own batch
- View and add news bulletins
- View shopping receipts

#### Hostel Super
Hostel Supers have administrative access.
They can:
- Approve and ban users from the site
- Archive alumni batches
- Allow new batches to create accounts
- Add or remove Hall Representatives
- View and add news bulletins
- View shopping receipts

---

For live preview vist [here](https://rtecmealmate.onrender.com).
Dummy Profile:
Email: `dummyuser@example.com` <button type="button" onclick="navigator.clipboard.writeText('dummyuser@example.com')">Copy</button>
Password: `password` <button type="button" onclick="navigator.clipboard.writeText('password')">Copy</button>