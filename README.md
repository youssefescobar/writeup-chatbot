# CTF Maker

CTF Maker is a web-based application designed to help cybersecurity enthusiasts and professionals create detailed and well-structured write-ups for Capture The Flag (CTF) challenges. By providing a step-by-step solution, including code snippets and images, users can leverage the power of AI to generate comprehensive documentation of their solutions.

## Features

- **AI-Powered Content Generation**: Utilizes Azure OpenAI's GPT-4 model to expand brief steps into a full-fledged write-up.
- **Rich Content Support**: Easily embed code snippets and images into your write-up.
- **Markdown Export**: Download the final write-up as a Markdown file.
- **Package Export**: Export the entire write-up, including images, as a zip archive for easy sharing and distribution.
- **Web-Based Interface**: A simple and intuitive web interface for creating and previewing write-ups.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Python 3.12 or higher
- [uv](https://github.com/astral-sh/uv) - A fast Python package installer and resolver.

### Install locally

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/writeup-chatbot.git
    cd writeup-chatbot
    ```

2.  **Create a virtual environment and install dependencies:**

    Using `uv`:

    ```bash
    # Create a virtual environment
    uv venv

    # Activate the virtual environment
    # On Windows
    .venv\Scripts\activate
    # On macOS/Linux
    source .venv/bin/activate

    # Install the dependencies
    uv pip install -r pyproject.toml
    ```

3.  **Configure Environment Variables:**

    The application requires an API key for the Azure OpenAI service. Create a `.env` file in the root of the project and add your API key:

    ```
    AZURE_OPENAI_API_KEY=your_azure_openai_api_key
    ```

### Running the Application

Once the dependencies are installed and the environment variables are set, you can run the application using `uvicorn`:

```bash
uvicorn main:app --host localhost --port 3131 --reload
```

The application will be available at `http://localhost:3131`.


### Run using docker

1. Create a `.env` file in the root of the project and add your API key:
```
    AZURE_OPENAI_API_KEY=your_azure_openai_api_key
```
2. build the image using the Dockerfile
```bash
    docker build -t ctf-maker .
```
3. Run Container
```bash
    docker run -p 3131:3131 ctf-maker
```
4. Access the app at http://localhost:3131/
    



## Project Structure

```
writeup-chatbot/
├── app/
│   ├── static/
│   │   ├── script.js       # Frontend JavaScript
│   │   └── style.css       # Frontend CSS
│   └── templates/
│       └── index.html      # HTML template for the main page
├── .env                    # Environment variables (needs to be created)
├── .gitignore
├── main.py                 # Main FastAPI application file
├── pyproject.toml          # Project dependencies
├── README.md               # This file
└── uv.lock                 # Lock file for uv
```
