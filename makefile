CFX	:= cfx
TARGET := fxlogcat.xpi

.PHONY: all test run cfx clean

all: test run release xpi

run test xpi: cfx
	@$(CFX) $@

$(TARGET) release: xpi

cfx:
	@if ! [ `which $@` ]; then \
		echo "### $@ from Addon SDK is required"; \
		exit 1; \
	fi

clean:
	@rm -f $(TARGET)
