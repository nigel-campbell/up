.PHONY: build run clean

$(shell mkdir -p bin)

build: frontend backend

frontend:
	npm install
	npm run build

backend:
	go build -o bin/up

run: build
	./bin/up

clean:
	rm -rf bin/
	rm -rf node_modules/
	rm -rf ui/static/* 