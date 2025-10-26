# TODO: Fix Email Photo Strip to Match Desktop View

## Tasks
- [x] Update public/index.html to send frame dimensions (displayFrameWidth, displayFrameHeight) and devicePixelRatio in the sendEmail function
- [x] Update server/index.js /send-email endpoint to generate attachment matching desktop photo strip: stack photos with gold frame overlays vertically, remove ghost overlay
- [x] Ensure gold frame sizing is responsive using client-provided dimensions
- [x] Fix black lines in email attachments by changing strip background to white

## Notes
- Desktop strip uses html2canvas to render wrappers with photos and gold frame overlays stacked vertically
- Email should replicate this without ghost, using Sharp for processing
- Use client sizes for responsive gold frame
