#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  TextContent,
  ImageContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import * as puppeteer from "puppeteer";
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
import { Browser, Page, ElementHandle } from "puppeteer";

puppeteerExtra.use(StealthPlugin());

// Define the tools once to avoid repetition
const TOOLS: Tool[] = [
  {
    name: "puppeteer_navigate",
    description: "Navigate to a URL and wait for page to be fully loaded",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        waitOptions: { 
          type: "string", 
          description: "Wait strategy: 'load', 'domcontentloaded', 'networkidle0', or 'networkidle2' (default)",
          default: "networkidle2"
        },
        timeout: { 
          type: "number", 
          description: "Navigation timeout in milliseconds (default: 60000)",
          default: 60000
        }
      },
      required: ["url"],
    },
  },
  {
    name: "puppeteer_screenshot",
    description: "Take a screenshot of the current page or a specific element",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name for the screenshot" },
        selector: { type: "string", description: "CSS selector for element to screenshot" },
        width: { type: "number", description: "Width in pixels (default: 1366)" },
        height: { type: "number", description: "Height in pixels (default: 768)" },
        fullPage: { type: "boolean", description: "Capture full page screenshot" }
      },
      required: ["name"],
    },
  },
  {
    name: "puppeteer_click",
    description: "Click an element on the page with advanced selection options",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for element to click" },
        text: { type: "string", description: "Text content the element should contain" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" },
        waitForNavigation: { type: "boolean", description: "Wait for navigation after click" },
        forceVisible: { type: "boolean", description: "Force click only if element is visible" },
        index: { type: "number", description: "Index if selector matches multiple elements (0-based)" },
        button: { type: "string", description: "Mouse button: left, right, middle (default: left)" },
        clickOptions: { 
          type: "object", 
          description: "Additional click options",
          properties: {
            clickCount: { type: "number", description: "Number of clicks (default: 1)" },
            delay: { type: "number", description: "Delay between mousedown and mouseup in ms" }
          }
        }
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_fill",
    description: "Fill out an input field with advanced waiting for element readiness",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for input field" },
        value: { type: "string", description: "Value to fill" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" },
        delay: { type: "number", description: "Delay between keystrokes in ms (default: random 50-150)" },
        clearFirst: { type: "boolean", description: "Clear input field before typing (default: true)" },
        submitAfter: { type: "boolean", description: "Press Enter after filling the field" }
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "puppeteer_select",
    description: "Select an option from a dropdown",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for select element" },
        value: { type: "string", description: "Value to select" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" },
        byText: { type: "boolean", description: "Select by visible text instead of value" }
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "puppeteer_hover",
    description: "Hover over an element",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for element to hover" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" }
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_wait_for_selector",
    description: "Wait for an element to appear, be visible, or disappear",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector" },
        visible: { type: "boolean", description: "Wait for element to be visible (default: true)" },
        hidden: { type: "boolean", description: "Wait for element to be hidden" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" }
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_evaluate",
    description: "Execute JavaScript in the browser context",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript code to execute" }
      },
      required: ["script"],
    },
  },
  {
    name: "puppeteer_find_by_text",
    description: "Find an element containing specific text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to search for" },
        tag: { type: "string", description: "HTML tag to limit search to (optional)" },
        exact: { type: "boolean", description: "Match text exactly (default: false)" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" }
      },
      required: ["text"],
    },
  }
];

// Global state
let browser: Browser | undefined;
let page: Page | undefined;
const consoleLogs: string[] = [];
const screenshots = new Map<string, string>();

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function for human-like typing
async function typeHumanLike(page: Page, selector: string, text: string, options: { delay?: number, clearFirst?: boolean } = {}) {
  const delayTime = options.delay ?? Math.floor(Math.random() * 100) + 50; // 50-150ms delay
  const clearFirst = options.clearFirst ?? true;
  
  await page.waitForSelector(selector, { timeout: 10000 });
  
  // Focus and click the element first
  await page.focus(selector);
  
  // Clear input if needed
  if (clearFirst) {
    await page.click(selector, { clickCount: 3 }); // Triple click to select all text
    await page.keyboard.press('Backspace');
  }
  
  // Type with random delays between keystrokes
  for (const char of text) {
    await page.keyboard.type(char, { delay: delayTime });
    
    // Add small random pauses occasionally to seem more human
    if (Math.random() < 0.05) {
      await delay(Math.floor(Math.random() * 300) + 100);
    }
  }
  
  // Small pause after typing
  await delay(Math.floor(Math.random() * 300) + 200);
}

// Find element by text content
async function findElementByText(page: Page, options: {
  text: string,
  tag?: string,
  exact?: boolean,
  timeout?: number
}): Promise<ElementHandle<Element> | null> {
  const timeout = options.timeout ?? 10000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Use evaluate to find element with text
      const result = await page.evaluateHandle((text, tag, exact) => {
        const allElements = tag 
          ? Array.from(document.querySelectorAll(tag))
          : Array.from(document.querySelectorAll('*'));
          
        return allElements.find(el => {
          const content = el.textContent?.trim() || '';
          return exact ? content === text : content.includes(text);
        }) || null;
      }, options.text, options.tag || '*', options.exact === true);
      
      if (result && (await result.evaluate(el => !!el))) {
        return result as ElementHandle<Element>;
      }
    } catch (error) {
      // Continue trying
    }
    
    // Sleep a short time before retrying
    await delay(100);
  }
  
  // If we get here, we didn't find the element within the timeout
  return null;
}

async function ensureBrowser() {
  if (!browser) {
    const npx_args = { 
      headless: false,
      defaultViewport: { width: 1366, height: 768 } 
    };
    
    const docker_args = { 
      headless: true, 
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-setuid-sandbox", "--single-process", "--no-zygote"],
      defaultViewport: { width: 1366, height: 768 }
    };
    
    browser = await puppeteerExtra.launch(process.env.DOCKER_CONTAINER ? docker_args : npx_args);
    const pages = await browser.pages();
    page = pages[0];

    // Set a more realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36');

    // Configure viewport
    await page.setViewport({ width: 1366, height: 768 });

    // Enable console logging
    page.on("console", (msg) => {
      const logEntry = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(logEntry);
      server.notification({
        method: "notifications/resources/updated",
        params: { uri: "console://logs" },
      });
    });
    
    // Track navigation events
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        consoleLogs.push(`[navigation] Navigated to: ${frame.url()}`);
        server.notification({
          method: "notifications/resources/updated",
          params: { uri: "console://logs" },
        });
      }
    });
  }
  return page!;
}

declare global {
  interface Window {
    mcpHelper: {
      logs: string[],
      originalConsole: Partial<typeof console>,
    }
  }
}

async function handleToolCall(name: string, args: any): Promise<CallToolResult> {
  const page = await ensureBrowser();

  try {
    switch (name) {
      case "puppeteer_navigate": {
        const waitOptions = {
          waitUntil: (args.waitOptions || 'networkidle2') as "load" | "domcontentloaded" | "networkidle0" | "networkidle2",
          timeout: args.timeout || 60000
        };

        await page.goto(args.url, waitOptions);
        
        // Add a small random delay to simulate human behavior
        await delay(Math.floor(Math.random() * 1000) + 500);
        
        return {
          content: [{
            type: "text",
            text: `Navigated to ${args.url} (waited for ${waitOptions.waitUntil})`,
          }],
          isError: false,
        };
      }

      case "puppeteer_screenshot": {
        const width = args.width ?? 1366;
        const height = args.height ?? 768;
        await page.setViewport({ width, height });

        let screenshot: string | Buffer | undefined;
        let elementDesc = "page";
        
        if (args.selector) {
          await page.waitForSelector(args.selector, { timeout: 10000 }).catch(() => null);
          const element = await page.$(args.selector);
          
          if (!element) {
            return {
              content: [{
                type: "text",
                text: `Element not found: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          screenshot = await element.screenshot({ encoding: "base64" });
          elementDesc = `CSS: ${args.selector}`;
        } else {
          screenshot = await page.screenshot({ 
            encoding: "base64", 
            fullPage: args.fullPage === true 
          });
        }

        screenshots.set(args.name, screenshot as string);
        server.notification({
          method: "notifications/resources/list_changed",
        });

        return {
          content: [
            {
              type: "text",
              text: `Screenshot '${args.name}' taken of ${elementDesc} at ${width}x${height}`,
            } as TextContent,
            {
              type: "image",
              data: screenshot as string,
              mimeType: "image/png",
            } as ImageContent,
          ],
          isError: false,
        };
      }

      case "puppeteer_click": {
        const timeout = args.timeout ?? 10000;
        const forceVisible = args.forceVisible !== false; // Default to true
        const index = args.index ?? 0;
        
        let elements;
        
        if (args.text) {
          // Find element with text
          const element = await findElementByText(page, {
            text: args.text,
            timeout: timeout
          });
          
          if (!element) {
            return {
              content: [{
                type: "text",
                text: `Element not found with text: "${args.text}"`,
              }],
              isError: true,
            };
          }
          
          elements = [element];
        } else {
          // Wait for selector
          try {
            await page.waitForSelector(args.selector, { timeout });
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `Timeout waiting for element: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          // Find elements by selector
          elements = await page.$$(args.selector);
          
          if (elements.length === 0 || elements.length <= index) {
            return {
              content: [{
                type: "text",
                text: `Element not found: ${args.selector} (index ${index})`,
              }],
              isError: true,
            };
          }
        }
        
        const element = elements[index];
        
        // Check visibility if required
        if (forceVisible) {
          const isVisible = await element.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                  style.visibility !== 'hidden' && 
                  style.opacity !== '0' &&
                  el.getBoundingClientRect().width > 0 &&
                  el.getBoundingClientRect().height > 0;
          });
          
          if (!isVisible) {
            return {
              content: [{
                type: "text",
                text: `Element found but not visible: ${args.selector || 'with text "' + args.text + '"'}`,
              }],
              isError: true,
            };
          }
        }
        
        // Add a small random delay before clicking
        await delay(Math.floor(Math.random() * 500) + 200);
        
        // Prepare click options
        const button = args.button === 'right' ? 'right' : 
                      args.button === 'middle' ? 'middle' : 'left';
                      
        const clickOptions = {
          button,
          clickCount: args.clickOptions?.clickCount || 1,
          delay: args.clickOptions?.delay || Math.floor(Math.random() * 100) + 50
        };
        
        // Set up navigation promise if needed
        const navigationPromise = args.waitForNavigation ? 
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }) : 
          null;
        
        // Do the click
        await element.click(clickOptions);
        
        // Wait for navigation if required
        if (navigationPromise) {
          await navigationPromise;
        }
        
        const describeElement = await element.evaluate(el => {
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className,
            text: el.textContent?.trim().substring(0, 50) + (el.textContent && el.textContent.length > 50 ? '...' : '')
          };
        });
        
        return {
          content: [{
            type: "text",
            text: `Clicked: ${describeElement.tag}${describeElement.id ? '#'+describeElement.id : ''} with text "${describeElement.text}" using button: ${button}`,
          }],
          isError: false,
        };
      }

      case "puppeteer_fill": {
        const timeout = args.timeout ?? 10000;
        const clearFirst = args.clearFirst !== false; // Default to true
        
        try {
          await page.waitForSelector(args.selector, { timeout });
          
          // Type the text with human-like behavior
          await typeHumanLike(page, args.selector, args.value, {
            delay: args.delay,
            clearFirst: clearFirst
          });
          
          // Press Enter if required
          if (args.submitAfter) {
            await page.keyboard.press('Enter');
            // Wait a bit after pressing Enter in case of form submission
            await delay(1000);
          }
          
          return {
            content: [{
              type: "text",
              text: `Filled ${args.selector} with: ${args.value}${args.submitAfter ? ' and pressed Enter' : ''}`,
            }],
            isError: false,
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to fill ${args.selector}: ${(error as Error).message}`,
            }],
            isError: true,
          };
        }
      }

      case "puppeteer_select": {
        const timeout = args.timeout ?? 10000;
        const byText = args.byText === true;
        
        try {
          await page.waitForSelector(args.selector, { timeout });
          
          if (byText) {
            // Select by visible text instead of value
            await page.evaluate((selector, optionText) => {
              const select = document.querySelector(selector) as HTMLSelectElement;
              if (!select) throw new Error(`Select element not found: ${selector}`);
              
              for (const option of Array.from(select.options)) {
                if (option.textContent?.trim() === optionText) {
                  select.value = option.value;
                  
                  // Dispatch change event
                  const event = new Event('change', { bubbles: true });
                  select.dispatchEvent(event);
                  
                  return;
                }
              }
              
              throw new Error(`Option with text "${optionText}" not found in select`);
            }, args.selector, args.value);
          } else {
            // Select by value
            await page.select(args.selector, args.value);
          }
          
          return {
            content: [{
              type: "text",
              text: `Selected option with ${byText ? 'text' : 'value'} "${args.value}" in ${args.selector}`,
            }],
            isError: false,
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to select ${args.selector}: ${(error as Error).message}`,
            }],
            isError: true,
          };
        }
      }

      case "puppeteer_hover": {
        const timeout = args.timeout ?? 10000;
        
        try {
          await page.waitForSelector(args.selector, { timeout });
          
          // Add a small random delay before hovering
          await delay(Math.floor(Math.random() * 200) + 50);
          
          const element = await page.$(args.selector);
          if (!element) {
            return {
              content: [{
                type: "text",
                text: `Element not found: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          // Hover over the element
          await element.hover();
          
          const describeElement = await element.evaluate(el => {
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id,
              className: el.className,
              text: el.textContent?.trim().substring(0, 50) + (el.textContent && el.textContent.length > 50 ? '...' : '')
            };
          });
          
          return {
            content: [{
              type: "text",
              text: `Hovered over: ${describeElement.tag}${describeElement.id ? '#'+describeElement.id : ''} with text "${describeElement.text}"`,
            }],
            isError: false,
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to hover ${args.selector}: ${(error as Error).message}`,
            }],
            isError: true,
          };
        }
      }

      case "puppeteer_wait_for_selector": {
        const timeout = args.timeout ?? 30000;
        
        try {
          const waitOptions = {
            visible: args.visible !== false && !args.hidden,
            hidden: args.hidden === true,
            timeout
          };
          
          await page.waitForSelector(args.selector, waitOptions);
          
          if (waitOptions.hidden) {
            return {
              content: [{
                type: "text",
                text: `Element is now hidden: ${args.selector}`,
              }],
              isError: false,
            };
          }
          
          // Get element info if it's visible
          const element = await page.$(args.selector);
          if (element) {
            const info = await element.evaluate(el => ({
              tag: el.tagName.toLowerCase(),
              id: el.id || '',
              classes: el.className || '',
              text: (el.textContent || '').trim().substring(0, 50)
            }));
            
            return {
              content: [{
                type: "text",
                text: `Element is now visible: ${info.tag}${info.id ? '#'+info.id : ''} with text "${info.text}${info.text.length >= 50 ? '...' : ''}"`,
              }],
              isError: false,
            };
          }
          
          return {
            content: [{
              type: "text",
              text: `Element is now present: ${args.selector}`,
            }],
            isError: false,
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Timeout waiting for element: ${args.selector}`,
            }],
            isError: true,
          };
        }
      }

      case "puppeteer_find_by_text": {
        const element = await findElementByText(page, {
          text: args.text,
          tag: args.tag,
          exact: args.exact,
          timeout: args.timeout
        });
        
        if (!element) {
          return {
            content: [{
              type: "text",
              text: `Element with text "${args.text}" not found`,
            }],
            isError: true,
          };
        }
        
        const elementInfo = await element.evaluate(el => {
          const rect = el.getBoundingClientRect();
          
          return {
            tagName: el.tagName.toLowerCase(),
            id: el.id || '',
            className: el.className || '',
            textContent: (el.textContent || '').trim(),
            html: el.outerHTML.substring(0, 200) + (el.outerHTML.length > 200 ? '...' : ''),
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          };
        });
        
        // Take a screenshot of the element
        const screenshot = await element.screenshot({ encoding: "base64" });
        const screenshotName = `text-${args.text.replace(/[^a-z0-9]/gi, '-').substring(0, 20)}-${Date.now()}`;
        
        screenshots.set(screenshotName, screenshot as string);
        server.notification({
          method: "notifications/resources/list_changed",
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Found element with text "${args.text}":\n\nDetails:\n${JSON.stringify(elementInfo, null, 2)}`,
            } as TextContent,
            {
              type: "image",
              data: screenshot as string,
              mimeType: "image/png",
            } as ImageContent
          ],
          isError: false,
        };
      }

      case "puppeteer_evaluate": {
        await page.evaluate(() => {
          window.mcpHelper = {
            logs: [],
            originalConsole: { ...console },
          };

          ['log', 'info', 'warn', 'error'].forEach(method => {
            (console as any)[method] = (...args: any[]) => {
              window.mcpHelper.logs.push(`[${method}] ${args.join(' ')}`);
              (window.mcpHelper.originalConsole as any)[method](...args);
            };
          });
        });

        const result = await page.evaluate(args.script);

        const logs = await page.evaluate(() => {
          Object.assign(console, window.mcpHelper.originalConsole);
          const logs = window.mcpHelper.logs;
          delete (window as any).mcpHelper;
          return logs;
        });

        return {
          content: [
            {
              type: "text",
              text: `Execution result:\n${JSON.stringify(result, null, 2)}\n\nConsole output:\n${logs.join('\n')}`,
            },
          ],
          isError: false,
        };
      }

      default:
        return {
          content: [{
            type: "text",
            text: `Unknown tool: ${name}`,
          }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error executing ${name}: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

const server = new Server(
  {
    name: "example-servers/puppeteer-enhanced",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);


// Setup request handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "console://logs",
      mimeType: "text/plain",
      name: "Browser console logs",
    },
    ...Array.from(screenshots.keys()).map(name => ({
      uri: `screenshot://${name}`,
      mimeType: "image/png",
      name: `Screenshot: ${name}`,
    })),
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();

  if (uri === "console://logs") {
    return {
      contents: [{
        uri,
        mimeType: "text/plain",
        text: consoleLogs.join("\n"),
      }],
    };
  }

  if (uri.startsWith("screenshot://")) {
    const name = uri.split("://")[1];
    const screenshot = screenshots.get(name);
    if (screenshot) {
      return {
        contents: [{
          uri,
          mimeType: "image/png",
          blob: screenshot,
        }],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {})
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on("close", () => {
  console.error("Puppeteer MCP Server closed");
  server.close();
  if (browser) {
    browser.close().catch(console.error);
  }
});
