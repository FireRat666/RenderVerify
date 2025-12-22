
# RenderVerify Event Registration System

RenderVerify is a web application designed for event registration and verification. It provides a simple interface for users to register for events using unique codes and a comprehensive dashboard for administrators to manage events, registration codes, and users.

## Features

- **User Registration:** Users can register for events using a unique registration code.
- **Registration Verification API:** A simple, public API endpoint to check if a user is registered for an event.
- **Admin Dashboard:** A secure dashboard for administrators to manage the application.
- **Event Management:** Admins can create, view, and delete events.
- **Code Management:** Admins can generate, view, and revoke registration codes for each event.
- **User Management:** Superadmins can create, delete, and manage other administrators.
- **Role-Based Access Control:** The application distinguishes between `admin` and `superadmin` roles, granting different levels of access.
- **Secure Authentication:** Uses JWT for secure authentication of administrators.

## Deployment & Setup

### Deployment with Render

This application is optimized for deployment on [Render](https://render.com/).

1. **Fork this repository** to your own GitHub account.
2. On the Render Dashboard, click **New +** and select **Web Service**.
3. Connect the GitHub repository you just created.
4. Configure the web service:
    - **Name:** Give your application a name (e.g., `render-verify`).
    - **Root Directory:** Leave this blank if your `package.json` is in the root.
    - **Environment:** Select `Node`.
    - **Build Command:** `npm install && npm run build`
    - **Start Command:** `npm start`
5. Click **Advanced** to add a **New PostgreSQL Database**. Render will automatically provision a database and set the `DATABASE_URL` environment variable for your web service.
6. Add the following **Environment Variables** to your web service:
    - `JWT_SECRET`: A long, random, and secret string for signing authentication tokens.
    - `FRONTEND_URL`: The URL of your deployed web service (e.g., `https://render-verify.onrender.com`).
7. Click **Create Web Service**. The initial deployment will take a few minutes.
8. **Database Setup:** After the first deployment, connect to your Render database using the "PSQL" command provided in the database details page and execute the SQL commands found in `databaseinfo.txt` to create the necessary tables. Then, follow the instructions in the "Creating the First Superadmin" section below to create your initial admin user.

### Manual Setup (Local or other platforms)

#### Prerequisites

- Node.js and npm
- PostgreSQL

#### Installation

1. Clone the repo:

    ```sh
    git clone https://github.com/your_username_/RenderVerify.git
    ```

2. Install NPM packages:

   ```sh
   npm install
   ```

#### Database Setup

1. **Create a PostgreSQL database.**
2. **Execute the SQL commands** in `databaseinfo.txt` to create the required tables (`events`, `codes`, `registrations`, `admins`, `users`).

#### Creating the First Superadmin

1. **Generate a password hash:**
    - Open the `create-hash.js` file.
    - Change the `password` variable to a strong, secret password of your choice.
    - Run the script to generate a secure hash:

        ```sh
        node create-hash.js
        ```

    - Copy the resulting hash string that is printed to the console.

2. **Insert the superadmin user into the database:**
    - Connect to your PostgreSQL database.
    - Execute the following SQL command, replacing `'PASSWORD_HASH_HERE'` with the hash you just generated:

        ```sql
        INSERT INTO admins (username, password_hash, role)
        VALUES ('superadmin', 'PASSWORD_HASH_HERE', 'superadmin');
        ```

#### Environment Variables

Create a `.env` file in the root directory and add the following, replacing the placeholder values:

 ```
 DATABASE_URL="postgresql://user:password@hostname:port/database"
 JWT_SECRET="your_jwt_secret"
 ```

### Running the Application

- **Development:** To run both the client and server concurrently in development mode:

    ```sh
   npm run dev
    ```

- **Production:** To build the React app and start the server:

    ```sh
    npm run build
    npm start
    ```

## Usage

1. **User Registration:** Navigate to `/code/:eventID/:userID/:username` to register for an event.
2. **Admin Access:**
    - Access the admin login page at `/admin`.
    - Log in with the credentials you created for the `superadmin`.
    - After logging in, you will be redirected to the admin dashboard where you can manage events, codes, and other users.
3. **Registration Verification API:**
    - Once a user is registered for an event, you can programmatically check their registration status by making a `GET` request to a specific URL. This is useful for integrating with other services or applications.
    - **Endpoint:** `GET /confirm/:eventID/:userID`
    - **Example Request:**

        ```
        GET https://your-app-url.com/confirm/my-event-123/user-abc-456
        ```

    - **Success Response (User is Registered):**

        ```json
        {
          "registered": true
        }
        ```

    - **Success Response (User is Not Registered):**

        ```json
        {
          "registered": false
        }
        ```

    - **Error Response (Invalid Parameters):**

        ```json
        {
          "error": "User ID and Event ID are required."
        }
        ```
