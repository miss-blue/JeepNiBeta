#!/usr/bin/env python3
"""
Script to run Jupyter Notebook for Passenger Forecasting Analysis
Run this script to start the Jupyter notebook server
"""

import subprocess
import sys
import os

def main():
    print("Starting Jupyter Notebook for Passenger Forecasting Analysis...")
    print("=" * 60)
    
    # Check if we're in the correct directory
    if not os.path.exists('notebooks'):
        print("Error: notebooks directory not found!")
        print("Please run this script from the project root directory.")
        return
    
    # Start jupyter notebook
    try:
        print("Opening Jupyter Notebook...")
        print("The notebook will open in your default web browser.")
        print("Navigate to: notebooks/passenger_forecasting_analysis.ipynb")
        print()
        print("Press Ctrl+C to stop the notebook server")
        print("=" * 60)
        
        # Run jupyter notebook
        subprocess.run([
            sys.executable, '-m', 'notebook', 
            '--notebook-dir=notebooks',
            '--ip=0.0.0.0',
            '--port=8888',
            '--no-browser',
            '--allow-root'
        ])
        
    except KeyboardInterrupt:
        print("\nJupyter Notebook server stopped.")
    except Exception as e:
        print(f"Error starting Jupyter Notebook: {e}")
        print("Please ensure Jupyter is installed: pip install notebook")

if __name__ == "__main__":
    main()