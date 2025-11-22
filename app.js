body {
    margin: 0;
    font-family: Arial, sans-serif;
    display: flex;
    background-color: #f5f5f5;
}

.sidebar {
    width: 220px;
    background-color: #ff5722;
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100vh;
    padding: 20px;
}

.sidebar h2 {
    text-align: center;
    margin-bottom: 20px;
}

.sidebar button {
    margin: 10px 0;
    padding: 10px;
    border: none;
    background-color: #e64a19;
    color: white;
    cursor: pointer;
    width: 100%;
    border-radius: 8px;
    font-weight: bold;
}

.sidebar button:hover {
    background-color: #ff7043;
}

.footer-btn {
    margin-top: auto;
}

.main-content {
    flex: 1;
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.card {
    background-color: white;
    padding: 20px 30px;
    border-radius: 10px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    margin-bottom: 20px;
    width: 100%;
    max-width: 500px;
}

.hidden {
    display: none;
}

input {
    display: block;
    margin: 10px 0;
    padding: 10px;
    width: 100%;
    border-radius: 5px;
    border: 1px solid #ccc;
}

button {
    cursor: pointer;
    border-radius: 5px;
}

.error {
    color: red;
    margin-top: 5px;
}

#user-list li {
    margin: 5px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

#user-list button {
    padding: 4px 8px;
    font-size: 0.85em;
}

#qr-reader {
    width: 100%;
    max-width: 400px;
    margin-top: 20px;
}

#scan-result {
    margin-top: 10px;
    font-weight: bold;
    text-align: center;
    color: #4caf50;
}
