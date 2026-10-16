# Vectorization API server image.
#
# Release builds pass NPM_PACKAGE_VERSION (see
# .github/actions/publish-dockerhub) and install exactly that published npm
# version. Local builds without the argument install the checked-out sources:
#
#   docker build -t numbers-vectorization .
#   docker run --rm -p 3000:3000 numbers-vectorization
#   curl --data-binary @examples/images/mnist-8.png \
#     'http://localhost:3000/vectorize?format=svg'
FROM node:24-alpine

ARG NPM_PACKAGE_VERSION=
ARG NPM_PACKAGE_NAME=@link-foundation/example-package-name

WORKDIR /tmp/package
COPY package.json README.md LICENSE ./
COPY bin ./bin
COPY src ./src

RUN if [ -n "$NPM_PACKAGE_VERSION" ]; then \
      npm install --global --ignore-scripts \
        "${NPM_PACKAGE_NAME}@${NPM_PACKAGE_VERSION}"; \
    else \
      npm install --global --ignore-scripts \
        "$(npm pack --ignore-scripts --silent)"; \
    fi \
    && rm -rf /tmp/package /root/.npm

WORKDIR /home/node
USER node

ENV HOST=0.0.0.0 \
    PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["example-package-name", "serve"]
