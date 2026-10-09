from fastapi import FastAPI

app = FastAPI(title="Simulation Results Dashboard")


@app.get("/")
def root():
    return {"message": "Simulation Results Dashboard API"}


@app.get("/health")
def health():
    return {"status": "ok"}
