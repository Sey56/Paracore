from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Define paths
BASE_DIR = Path(__file__).resolve().parent
private_key_path = BASE_DIR / "jwt_private.pem"
public_key_path = BASE_DIR / "jwt_public.pem"

def generate_and_save_keys():
    """Generates RSA private and public keys and saves them to .pem files."""
    if private_key_path.exists() or public_key_path.exists():
        print("Key files already exist. Skipping generation.")
        return

    print("Generating new RSA key pair...")
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Serialize and save private key
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    private_key_path.write_bytes(pem_private)
    print(f"Private key saved to {private_key_path}")

    # Serialize and save public key
    public_key = private_key.public_key()
    pem_public = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_key_path.write_bytes(pem_public)
    print(f"Public key saved to {public_key_path}")
    print("\nDone.")

if __name__ == "__main__":
    generate_and_save_keys()
