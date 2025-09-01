import os, mysql.connector
from dotenv import load_dotenv
load_dotenv()

def get_conn():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST","127.0.0.1"),
        port=int(os.getenv("DB_PORT","3306")),
        user=os.getenv("DB_USER","root"),
        password=os.getenv("DB_PASS","pass1234"),
        database=os.getenv("DB_NAME","assetvault"),
        autocommit=False,
    )
