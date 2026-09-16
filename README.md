# Dynamic Canvas

A lightweight system dynamics MVP inspired by Vensim PLE, focused on accessibility and rapid scenario exploration.

## MVP features

- visual canvas for stocks, flows, variables and parameters
- causal links with positive/negative polarity
- simple equations and Euler time-step simulation
- scenario playground with sliders
- baseline vs scenario comparison
- basic feedback-loop detection
- local save plus JSON import/export
- preloaded product-adoption example

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static HTTP server.

Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Product direction

The goal is not to reproduce the full power of Vensim. Dynamic Canvas is aimed at occasional system-dynamics users who want to understand, model and discuss dynamic behavior without mastering specialist notation first.
