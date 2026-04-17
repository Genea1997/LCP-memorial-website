# LCP Memorial

Production-ready NGO website with:

- Razorpay-backed donations
- SQLite-backed notifications and roadmap
- File uploads for gallery images
- Optional admin protection for uploads and published updates

## The stack is:

- HTML for structure
- CSS for design
- JavaScript for frontend interactivity
- Node.js + Express for the backend
- SQLite for the database
- Multer for file uploads
- Razorpay for payments
- Render for deployment

## Local run

1. Copy `.env.example` to `.env`
2. Fill in your Razorpay credentials and an `ADMIN_KEY`
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Environment variables

- `PORT`: server port
- `RAZORPAY_KEY_ID`: public Razorpay key id
- `RAZORPAY_KEY_SECRET`: secret used for order creation and signature verification
- `ADMIN_KEY`: required for gallery uploads/deletes and posting notifications when set

## Deploy on Render

1. Push this project to GitHub
2. Create a new Render Web Service from the repo
3. Render will detect [render.yaml](/Users/geneaghosh/Documents/New project/render.yaml)
4. Set the secret values for `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
5. Use the generated `ADMIN_KEY` or replace it with your own
6. Deploy the service
7. Add your custom domain in Render and enable HTTPS

## Important production note

This app currently stores uploads on the server filesystem and data in SQLite. That is fine for a small MVP, but for a more durable public deployment you should move to:

- PostgreSQL for the database
- S3, Cloudinary, or another object store for images
