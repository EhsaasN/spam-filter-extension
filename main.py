from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import torch.nn.functional as F
import logging
import os
import uvicorn

logging.basicConfig(level=logging.INFO)

app = FastAPI()

# ✅ Allow CORS from your Chrome extension origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        #"chrome-extension://ldmoldpjjjadocnlgkefafcgldieoagd",  # your extension ID
        # "http://localhost:3000",
        # "https://spam-filter-extension-40h8lni1n-ehsaas-projects-5cc0e187.vercel.app"
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_name = "mrm8488/bert-tiny-finetuned-sms-spam-detection"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)

class EmailInput(BaseModel):
    subject: str
    body: str

@app.post("/api/predict")
async def predict_spam(data: EmailInput, request: Request):
    try:
        text = f"{data.subject} {data.body}"
        inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=512)
        with torch.no_grad():
            outputs = model(**inputs)
            probs = F.softmax(outputs.logits, dim=1)[0]

        spam_prob = probs[1].item()
        not_spam_prob = probs[0].item()
        prediction = "spam" if spam_prob > 0.7 else "not_spam"

        return JSONResponse({
            "prediction": prediction,
            "spam_probability": spam_prob,
            "not_spam_probability": not_spam_prob
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# import os
#no storage
# if __name__ == "__main__":
#     port = int(os.environ.get("PORT", 8080))
#     uvicorn.run("main:app", host="0.0.0.0", port=port)

