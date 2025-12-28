# RAP-Auth-Server: Authentication & Authorization for Paracore

The `rap-auth-server` is a robust, cloud-ready authentication and authorization service for the Paracore ecosystem. Built with Python and FastAPI, it handles user identity, team management, and access control, providing a secure foundation for all Paracore services.

The server integrates with Google for authentication and uses a sophisticated team-based permission model to manage user access.

## Core Features

- **Google OAuth2 Integration:** Secure and simple user sign-up and login using Google accounts.
- **JWT-Based Authentication:** Uses JSON Web Tokens (JWTs) signed with an RS256 algorithm (public/private key pair) for stateless, secure API access.
- **JWKS Endpoint:** Provides a standard `/.well-known/jwks.json` endpoint for client applications to fetch the public key and verify token signatures.
- **Team Management:**
    - Users are organized into **Teams**.
    - New users automatically have a personal team created for them, with themselves as the `admin`.
    - Support for inviting new members to a team via a secure token-based invitation link.
- **Role-Based Access Control (RBAC):**
    - Three-tiered role system: `admin`, `developer`, and `user`.
    - Admins can manage team members, roles, and invitations.
    - Developers and admins have access to specific management endpoints.
- **Database Support:** Uses SQLAlchemy for ORM, making it compatible with PostgreSQL for production and SQLite for easy development.

## Technology Stack

- **Backend Framework:** [FastAPI](https://fastapi.tiangolo.com/)
- **Authentication:** [Google OAuth2](https://developers.google.com/identity/protocols/oauth2), [python-jose](https://github.com/mpdavis/python-jose) for JWTs
- **Database ORM:** [SQLAlchemy](https://www.sqlalchemy.org/)
- **Database Driver:** [psycopg2-binary](https://pypi.org/project/psycopg2-binary/) (for PostgreSQL)
- **Configuration:** [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- **Async HTTP Client:** [httpx](https://www.python-httpx.org/)

## API Endpoints

The server exposes several key endpoints:

- **`GET /login/google`**: Initiates the Google OAuth2 login flow by redirecting the user to Google's authentication page.
- **`GET /auth/callback`**: The callback URL that Google redirects to after successful authentication. The server exchanges the received code for user tokens and creates a local user session.
- **`POST /auth/verify-google-token`**: An alternative, server-to-server flow where a frontend can send a Google ID token to be verified, returning a Paracore-specific JWT.
- **`GET /.well-known/jwks.json`**: Exposes the public key in JWK format for clients to verify JWT signatures.
- **`GET /api/users/me/team`**: Retrieves detailed information about the current user's active team, including a list of members.
- **`GET /api/teams/{team_id}/members`**: (Admin/Developer) Gets a list of all members in a specific team.
- **`PUT /api/teams/{team_id}/members/{user_id}/role`**: (Admin) Updates the role of a team member.
- **`DELETE /api/teams/{team_id}/members/{user_id}`**: (Admin) Removes a member from a team.
- **`POST /api/teams/{team_id}/invite`**: (Admin) Creates a new invitation link for a user to join the team.

## Setup and Running

1.  **Clone the repository.**

2.  **Create a virtual environment and install dependencies:**
    ```bash
    # Using uv (recommended)
    uv venv
    uv pip install -r requirements.txt

    # Or using venv/pip
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the `rap-auth-server/server` directory. Populate it with the necessary values:
    ```env
    # The URL of your frontend application for redirects
    FRONTEND_URL="tauri://localhost"

    # Your Google OAuth2 credentials
    GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
    GOOGLE_CLIENT_SECRET="your_google_client_secret"
    REDIRECT_URI="http://127.0.0.1:8001/auth/callback"

    # Database connection string
    # For local development with SQLite:
    DATABASE_URL="sqlite:///./rap_auth.db"
    # For production with PostgreSQL:
    # DATABASE_URL="postgresql://user:password@host:port/database_name"
    ```

4.  **Generate JWT Keys:**
    The server uses an RS256 asymmetric algorithm, which requires a private and public key pair. Run the provided script to generate them:
    ```bash
    python generate_keys.py
    ```
    This will create `jwt_private.pem` and `jwt_public.pem` in the same directory.

5.  **Run the server:**
    ```bash
    uvicorn main:app --host 127.0.0.1 --port 8001 --reload
    ```
    The server will be available at `http://127.0.0.1:8001`.