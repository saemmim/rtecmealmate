# RTEC Meal Mate — Current Structure

## 1. Authentication & Registration

### Login & Registration

* Login
* Registration
* Authentication
* Account status handling

### Account States

* Pending
* Active
* Banned

---

# 2. Pending Page

* Registration status
* Profile picture setup/profile information
* Contact Hostel Super

---

# 3. Banned Page

* Banned status
* Profile information
* Delete profile

---

# 4. General User Dashboard

## 4.1 Home

### Today's Meal

* Today's meal status
* Turn today's meal On/Off where applicable
* Turn **next day's meal** On/Off

### Guest Meals

* Add guest meal
* View today's/relevant guest meal information
* Guest meal count

### Monthly Summary

* Total meals this month
* Total deposit this month
* Total meal cost
* Credit/Debit

---

## 4.2 Calendar View

### Calendar

Shows:

* Own meals
* Guest meals

### Monthly Information

* Meals
* Guest meals
* Total meals
* Meal rate
* Total meal cost
* Deposit amount
* Credit/Debit

### Transactions

* View transactions for the selected month

This should allow the user to see where deposits/financial changes came from rather than only seeing the final balance.

---

# 5. Bulletin

The previous **Notes** feature is now officially called **Bulletin** throughout the backend/frontend.

It is essentially a **bulletin board for announcements/messages**.

### Bulletin Card

Each card contains the complete message directly on the dashboard/page.

#### Header

* Profile picture
* Name
* Username
* Phone
* Role

#### Body

* Heading
* Full bulletin/message

#### Footer

* Date
* Edited indicator, if edited

### Role-based appearance

Different appearance according to:

* `mm` — Meal Manager
* `hr` — Hall Representative
* `hs` — Hostel Super

### Permissions

Users:

* View bulletins

Meal Manager:

* Add bulletin
* Edit own bulletin

Hall Representative:

* Add bulletin
* Edit own bulletin

Hostel Super:

* Add bulletin
* Edit own bulletin

No:

* Separate bulletin opening page
* Separate bulletin detail window
* Pinned announcement
* Expiration date
* Archive mechanism

So a bulletin is simply a complete message card displayed in the bulletin section.

---

# 6. Receipts

### Receipt Card

* Receipt date
* Added by
* Added/edited at
* Edit button according to permission
* Item table

  * Serial number
  * Item name
  * Cost
* Total cost
* Receipt image

### Functions

Users:

* View receipts
* Download receipts

Meal Manager:

* Add receipts
* Edit own receipts

Other roles:

* View receipts

---

# 7. User Options

### Options

* Dark Mode On/Off
* Meal Manager Dashboard

  * Month list
  * Active month dashboard
  * Archived month dashboard
* Hall Representative Dashboard
* See Roles
* Profile Setting
* Logout

**Change Password is NOT an Options item.**

It will be handled inside:

> **Profile Setting → Change Password**

---

# 8. Meal Manager Dashboard

## 8.1 Home

### Today's Meal Count

* Total meals today
* Meal of Xth batch
* Meal of X+1th batch
* Meal of X+2th batch
* Meal of X+3th batch

### Monthly Summary

* Total meals this month
* Total deposit this month
* Total expense this month
* Credit/Debit

### Bulletin

Same bulletin system as the general dashboard.

Meal Manager can:

* View bulletins
* Add bulletin
* Edit own bulletin

---

# 9. Meal Manager Calendar

### Calendar

* Date-wise meal count

### Monthly Batch Summary

* Batch-wise total meals
* Batch-wise total collection
* Batch-wise due

### Meal Configuration

* Select expected meal rate
* Select/set meal lock time for each day

---

# 10. Meal Manager — Manage Users

### Date Selector

* Default: Today
* Select another date

### User Cards

Each card can contain:

* Profile picture
* Name
* Username
* Department
* Batch
* Phone
* Meal status
* Deposit amount
* Remaining amount

### Meal Control

* Meal On
* Meal Off

For past dates:

* Meal buttons disabled

---

## Transactions

The previous `+` deposit button is replaced by a:

> **Transactions**

button.

Clicking Transactions opens the user's transaction interface.

Inside Transactions, the Meal Manager can:

* View user's transactions
* Add deposit
* See deposit history
* See transaction amount
* See transaction date
* See who added the transaction
* See relevant balance information

This is a cleaner design than putting only a `+` button beside every user.

---

# 11. Meal Manager Bulletin

* View bulletin
* Add bulletin
* Edit own bulletin

---

# 12. Meal Manager Receipts

* View receipts
* Add receipt
* Edit own receipt

---

# 13. Meal Manager Options

* Dark Mode
* Count Users
* Return to User Dashboard
* Hall Representative Dashboard
* See Roles
* Profile Setting
* Logout

No Change Password here.

---

# 14. Hall Representative Dashboard

## Select Managers

### Month Selector

* Select month

### Users Tab

* Eligible users
* User card
* Make Manager

### Managers Tab

* Current/previous managers
* Remove Manager

### Manager History

Retained by month.

---

# 15. Hall Representative Bulletin

* View bulletins
* Add bulletin
* Edit own bulletin

---

# 16. Hall Representative Receipts

* View receipts

---

# 17. Hall Representative Options

* Dark Mode
* Return to User Dashboard
* Meal Manager Dashboard
* See Roles
* Profile Setting
* Logout

---

# 18. Hostel Super Dashboard

## Select Representatives

### Users Tab

* Eligible users
* Make Representative

### Representatives Tab

* Current representatives
* Remove Representative

### Role History

Retained permanently/history-wise.

---

# 19. Hostel Super — User Approval

### Pending

* User cards
* Approve
* Reject

### Active

* User cards
* Ban

### Banned

* User cards
* Restore/Unban, if implemented

---

# 20. Hostel Super Bulletin

* View bulletins
* Add bulletin
* Edit own bulletin

---

# 21. Hostel Super Receipts

* View receipts

---

# 22. Hostel Super Options

* Dark Mode
* See Roles
* Profile Setting
* Logout

---

# 23. Count Users

* Remaining tab
* Completed tab
* User cards
* Complete/Remaining action

---

# 24. See Roles

### Managers

`mm`

### Representatives

`hr`

### Administration

`hs`

User cards show:

* Profile picture
* Name
* Username
* Department
* Batch
* Phone

---

# 25. Profile Setting

### Profile

For student users:

* Profile picture
* Name
* Username
* Department
* Batch
* Phone
* Email

For administrator profiles where applicable:

* Profile picture
* Name
* Username
* Designation
* Phone
* Email

### Profile Picture

* Upload
* Replace
* Virus scan
* Image validation
* Processing/conversion

### Change Password

Located **inside Profile Setting**.

* Current password
* New password
* Confirm password

---

# 26. Role System

| Role   | Main Responsibility                         |
| ------ | ------------------------------------------- |
| `user` | Own meals, guest meals, dashboard           |
| `mm`   | Meal management, deposits, receipts         |
| `hr`   | Meal Manager management                     |
| `hs`   | User approval and Representative management |

Multiple users can hold the same role.

### Role lifetime

**MM**

* Monthly
* Historical records retained

**HR**

* Does not expire automatically
* Historical records retained

**HS**

* Does not expire automatically
* Historical records retained

---

# 27. Financial Structure

The financial system now has three important concepts:

### Meals

```text
Own Meals
+
Guest Meals
```

### Transactions

```text
Deposits
+
Other financial transactions, if needed later
```

### Receipts

```text
Food/meal-related expenses
```

Then the user's monthly financial summary can be derived from:

```text
Total Meal Cost
-
Total Deposits
=
Credit / Debit
```

while the Meal Manager's financial summary can use the appropriate collection/expense calculation.

---

# 28. Important Development Status

You said:

> **All pages except dashboards are already prepared with complete frontend and backend.**

So I would **not rebuild**:

* Login/Registration
* Pending
* Banned
* Profile Setting
* Change Password
* Count Users
* See Roles
* Other already-completed standalone pages

The remaining major work is the **four dashboard systems**:

```text
1. General User Dashboard
2. Meal Manager Dashboard
3. Hall Representative Dashboard
4. Hostel Super Dashboard
```

And these dashboards will reuse your already-completed backend endpoints/pages wherever possible.

### One thing I would keep in mind

The dashboard shouldn't become four completely independent applications. There is substantial shared functionality:

```text
                    RTEC MEAL MATE
                          │
          ┌───────────────┼───────────────┐
          │               │               │
       General           MM              HR              HS
      Dashboard      Dashboard       Dashboard       Dashboard
          │               │               │
          └──────── Shared Components ─────────┘
                  │
        ┌─────────┼──────────┐
        │         │          │
      Meal      Bulletin   Receipts
      Data                 Transactions
```

That will make the dashboard implementation considerably easier to maintain.