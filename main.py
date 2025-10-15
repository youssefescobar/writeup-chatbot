from fastapi import FastAPI, Request, Response
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import AzureOpenAI
import json
import re
import os
from dotenv import load_dotenv
import zipfile
from io import BytesIO
import base64

load_dotenv()  # Load environment variables from .env file

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")

# Azure OpenAI Configuration
endpoint = "https://ai-writeups-bot.openai.azure.com/"
model_name = "gpt-4.1-mini"
deployment = "1-mini-2025-04-14-llm-writeup"
api_version = "2024-12-01-preview"


def preprocess_markdown_to_placeholders(markdown_text):
    """
    Converts markdown image syntax ![alt](path) to [[img#]] placeholders.
    Returns:
        replaced_text: str (with [[img#]] tags)
        mapping: dict (tag -> original markdown)
    """
    image_pattern = r'!\[([^\]]*)\]\(([^)]+)\)'
    mapping = {}
    count = 1

    def replacer(match):
        nonlocal count
        tag = f"[[img{count}]]"
        mapping[tag] = match.group(0)  # Full markdown image string
        count += 1
        return tag

    replaced_text = re.sub(image_pattern, replacer, markdown_text)
    return replaced_text, mapping

def postprocess_placeholders_to_markdown(llm_output, mapping):
    """
    Converts [[img#]] tags back to original Markdown images.
    """
    for tag, original in mapping.items():
        llm_output = llm_output.replace(tag, original)
    return llm_output

class WriteupRequest(BaseModel):
    steps: str
    max_tokens: int = 4096
    temperature: float = 0.4
    top_p: float = 0.9

class MarkdownDownloadRequest(BaseModel):
    content: str

class PackageDownloadRequest(BaseModel):
    content: str
    placeholders: dict

@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

async def generate_writeup_stream(writeup_request: WriteupRequest):
    # Define a list of simple, non-substantive messages
    simple_messages = ["hi", "hello", "hey", "testing", "test", "good morning", "good afternoon", "good evening"]

    # Check if the user's message is one of the simple messages or is a very short message
    if writeup_request.steps.strip().lower() in simple_messages or len(writeup_request.steps.strip()) < 100:
        yield f"data: {json.dumps({'content': 'Sorry message too short to be a writeup.'})}\n\n"
        return

    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    if not api_key:
        yield f"data: {json.dumps({'error': 'AZURE_OPENAI_API_KEY not found in environment variables.'})}\n\n"
        return

    client = AzureOpenAI(
        api_version=api_version,
        azure_endpoint=endpoint,
        api_key=api_key
    )

    try:
        # ✅ Preprocess markdown
        processed_steps, image_mapping = preprocess_markdown_to_placeholders(writeup_request.steps)
        
        # Send preprocessed steps to model
        response = client.chat.completions.create(
            stream=True,
            messages=[
                {"role": "system", 
                 "content": """You are an expert CTF (Capture The Flag) player and technical writer.
                            Your task: expand short CTF challenge solutions into detailed, educational write-ups for cybersecurity challenges.

                            ## Core Rules
                            1. Follow steps exactly, in original order.  
                            2. Keep all placeholder tags ([[img#]]`, [[code#]]) unchanged — do not add, renumber, or remove them.  
                            3. Expand each step with:
                            - Context & background (why, not just what)  
                            - Reasoning for actions taken  
                            - Tool/command usage explanations  
                            - Vulnerability analysis & exploitation details
                            - Educational insights & broader security principles

                            ## Guidelines
                            - **Technical depth:** explain vulnerabilities, methods, and concepts clearly.
                            - **Educational value:** add context, prerequisites, definitions, and takeaways.
                            - **Structure:** maintain logical flow with clear headings and transitions.
                            - **Language:** professional, precise, instructional, and accessible.

                            ## Output
                            Produce a comprehensive write-up that:
                            - Preserves placeholders exactly.
                            - Expands steps into detailed, accurate explanations.
                            - Provides learning value and smooth progression."""},
                {
                 "role": "user", 
                 "content": processed_steps
                }
            ],
            max_tokens=writeup_request.max_tokens,
            temperature=writeup_request.temperature,
            top_p=writeup_request.top_p,
            model=deployment,
        )

        # ✅ Send mapping first (to frontend)
        yield f"data: {json.dumps({'mapping': image_mapping})}\n\n"

        # ✅ Stream model chunks normally
        for chunk in response:
            if chunk.choices:
                content = chunk.choices[0].delta.content
                if content:
                    yield f"data: {json.dumps({'content': content})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    finally:
        client.close()

@app.post("/generate")
async def generate_writeup(writeup_request: WriteupRequest):
    return StreamingResponse(
        generate_writeup_stream(writeup_request),
        media_type="text/event-stream"
    )

@app.post("/download/markdown")
async def download_markdown(request: MarkdownDownloadRequest):
    mem_file = BytesIO()
    mem_file.write(request.content.encode('utf-8'))
    mem_file.seek(0)
    
    return Response(
        mem_file.read(),
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=writeup.md"}
    )

@app.post("/download/package")
async def download_package(request: PackageDownloadRequest):
    content = request.content
    placeholders = request.placeholders
    
    zip_buffer = BytesIO()
    
    # Prepare replacements and assets first
    replacements = {}
    assets_to_zip = []
    img_dir = "images/"

    for placeholder, data in placeholders.items():
        if placeholder.startswith("[[img"):
            try:
                # Extract image extension, default to png if not found
                parts = data.split(';')[0].split('/')
                img_extension = parts[1] if len(parts) > 1 else 'png'
                
                img_filename = f"{placeholder.strip('[]')}.{img_extension}"
                img_path_in_zip = f"{img_dir}{img_filename}"
                
                # Use the placeholder name (e.g., "img1") as alt text
                alt_text = placeholder.strip('[]')
                replacements[re.escape(placeholder)] = f"![{alt_text}]({img_path_in_zip})"
                
                img_data = base64.b64decode(data.split(',')[1])
                assets_to_zip.append((img_path_in_zip, img_data))

            except (IndexError, ValueError) as e:
                print(f"Could not process image placeholder {placeholder}: {e}")
                replacements[re.escape(placeholder)] = f"[ERROR: Could not process image {placeholder}]"

        elif placeholder.startswith("[[code"):
            replacements[re.escape(placeholder)] = f"```\n{data}\n```"

    # Perform all replacements at once using a single regex
    if replacements:
        pattern = re.compile("|".join(replacements.keys()))
        
        def replacer(match):
            return replacements.get(re.escape(match.group(0)), match.group(0))

        content = pattern.sub(replacer, content)

    # Write assets and the modified markdown to the zip file
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_f:
        for path_in_zip, asset_data in assets_to_zip:
            zip_f.writestr(path_in_zip, asset_data)
        
        zip_f.writestr("writeup.md", content.encode('utf-8'))

    zip_buffer.seek(0)
    
    return Response(
        zip_buffer.read(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=writeup_package.zip"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="localhost", port=3131, reload=True)