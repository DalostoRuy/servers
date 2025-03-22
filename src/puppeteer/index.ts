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

// Importar puppeteer-extra e o plugin stealth
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser, Page, ElementHandle } from "puppeteer";

// Aplicar o plugin stealth
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
        selector: { type: "string", description: "CSS selector or XPath for element to screenshot" },
        width: { type: "number", description: "Width in pixels (default: 1366)" },
        height: { type: "number", description: "Height in pixels (default: 768)" },
        fullPage: { type: "boolean", description: "Capture full page screenshot" },
        isXPath: { type: "boolean", description: "Use XPath instead of CSS selector" }
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
        selector: { type: "string", description: "CSS selector or XPath for element to click" },
        text: { type: "string", description: "Text content the element should contain" },
        isXPath: { type: "boolean", description: "Use XPath instead of CSS selector" },
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
        selector: { type: "string", description: "CSS selector or XPath for input field" },
        value: { type: "string", description: "Value to fill" },
        isXPath: { type: "boolean", description: "Use XPath instead of CSS selector" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" },
        delay: { type: "number", description: "Delay between keystrokes in ms (default: random 50-150)" },
        clearFirst: { type: "boolean", description: "Clear input field before typing (default: true)" },
        submitAfter: { type: "boolean", description: "Press Enter after filling the field" },
        index: { type: "number", description: "Index if selector matches multiple elements (0-based)" }
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "puppeteer_select",
    description: "Select an option from a dropdown with advanced selection",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or XPath for select element" },
        value: { type: "string", description: "Value to select" },
        isXPath: { type: "boolean", description: "Use XPath instead of CSS selector" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" },
        byText: { type: "boolean", description: "Select by visible text instead of value" },
        index: { type: "number", description: "Index if selector matches multiple elements (0-based)" }
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "puppeteer_hover",
    description: "Hover over an element with advanced selection",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or XPath for element to hover" },
        isXPath: { type: "boolean", description: "Use XPath instead of CSS selector" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" },
        index: { type: "number", description: "Index if selector matches multiple elements (0-based)" }
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_wait_for_element",
    description: "Advanced waiting for an element with various conditions",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or XPath" },
        isXPath: { type: "boolean", description: "Use XPath instead of CSS selector" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
        waitFor: { 
          type: "string", 
          description: "Wait condition: 'visible', 'hidden', 'present', 'stable' (default: visible)" 
        },
        text: { type: "string", description: "Text content the element should contain" },
        pollInterval: { type: "number", description: "Check interval in milliseconds (default: 100)" }
      },
      required: ["selector"],
    },
  },
  {
    name: "puppeteer_wait_for_network_idle",
    description: "Wait for network to become idle (useful for SPAs)",
    inputSchema: {
      type: "object",
      properties: {
        timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
        idleTime: { type: "number", description: "Consider idle after no requests for X ms (default: 500)" },
        maxInflightRequests: { type: "number", description: "Max concurrent requests allowed (default: 0)" }
      }
    },
  },
  {
    name: "puppeteer_find_element",
    description: "Find element using multiple criteria (advanced element selector)",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or XPath (optional if using other criteria)" },
        isXPath: { type: "boolean", description: "Use XPath instead of CSS selector" },
        text: { type: "string", description: "Text content the element should contain (exact or partial)" },
        textExact: { type: "boolean", description: "Match text exactly (default: false)" },
        tagName: { type: "string", description: "HTML tag name (e.g., 'button', 'input')" },
        attributes: { 
          type: "object", 
          description: "HTML attributes the element should have (name:value pairs)",
        },
        position: { 
          type: "object", 
          description: "Position parameters",
          properties: {
            index: { type: "number", description: "Index among matches (0-based)" },
            near: { type: "string", description: "CSS selector or text of nearby element" },
            visible: { type: "boolean", description: "Element must be visible (default: true)" }
          }
        },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)" },
        takeScreenshot: { type: "boolean", description: "Take screenshot of found element" },
        screenshotName: { type: "string", description: "Screenshot name if taking one" }
      }
    },
  },
  {
    name: "puppeteer_evaluate",
    description: "Execute JavaScript in the browser context",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript code to execute" },
        args: { 
          type: "array", 
          description: "Arguments to pass to the script",
          items: { type: "string" }
        }
      },
      required: ["script"],
    },
  },
];

// Global state
let browser: Browser | undefined;
let page: Page | undefined;
const consoleLogs: string[] = [];
const screenshots = new Map<string, string>();

// ====== UTILITY FUNCTIONS ======

// Helper function for human-like typing
async function typeHumanLike(page: Page, element: ElementHandle<Element>, text: string, options: { delay?: number, clearFirst?: boolean } = {}) {
  const delay = options.delay ?? Math.floor(Math.random() * 100) + 50; // 50-150ms delay
  const clearFirst = options.clearFirst ?? true;
  
  // Focus the element first
  await element.focus();
  
  // Clear input if needed
  if (clearFirst) {
    await element.click({ clickCount: 3 }); // Triple click to select all text
    await page.keyboard.press('Backspace');
  }
  
  // Type with random delays between keystrokes
  for (const char of text) {
    await page.keyboard.type(char, { delay });
    
    // Add small random pauses occasionally to seem more human
    if (Math.random() < 0.05) {
      await page.waitForTimeout(Math.floor(Math.random() * 300) + 100);
    }
  }
  
  // Small pause after typing
  await page.waitForTimeout(Math.floor(Math.random() * 300) + 200);
}

// Advanced element finder that supports multiple criteria
async function findElement(page: Page, options: {
  selector?: string,
  isXPath?: boolean,
  text?: string,
  textExact?: boolean,
  tagName?: string,
  attributes?: Record<string, string>,
  position?: {
    index?: number,
    near?: string,
    visible?: boolean
  },
  timeout?: number
}): Promise<ElementHandle<Element> | null> {
  const timeout = options.timeout ?? 10000;
  const startTime = Date.now();
  
  // Default position settings
  const position = options.position || {};
  const index = position.index ?? 0;
  const mustBeVisible = position.visible ?? true;
  
  while (Date.now() - startTime < timeout) {
    try {
      let elements: ElementHandle<Element>[] = [];
      
      // Find elements using the selector or XPath
      if (options.selector) {
        if (options.isXPath) {
          elements = await page.$x(options.selector);
        } else {
          const allElements = await page.$$(options.selector);
          elements = allElements;
        }
      }
      // If no selector but a tag name is provided
      else if (options.tagName) {
        elements = await page.$$(options.tagName);
      }
      // If no selector and no tag, use all elements (not recommended but possible)
      else if (!options.selector && !options.tagName) {
        elements = await page.$$('*');
      }
      
      // Filter by text content if specified
      if (options.text && elements.length > 0) {
        const filteredElements: ElementHandle<Element>[] = [];
        for (const element of elements) {
          const textContent = await page.evaluate(el => el.textContent, element);
          
          if (textContent) {
            if (options.textExact) {
              // Match text exactly
              if (textContent.trim() === options.text) {
                filteredElements.push(element);
              }
            } else {
              // Match text partially
              if (textContent.includes(options.text)) {
                filteredElements.push(element);
              }
            }
          }
        }
        elements = filteredElements;
      }
      
      // Filter by tag name if specified (and wasn't used as primary selector)
      if (options.tagName && options.selector) {
        const filteredElements: ElementHandle<Element>[] = [];
        for (const element of elements) {
          const tagName = await page.evaluate(el => el.tagName, element);
          if (tagName.toLowerCase() === options.tagName.toLowerCase()) {
            filteredElements.push(element);
          }
        }
        elements = filteredElements;
      }
      
      // Filter by attributes if specified
      if (options.attributes && Object.keys(options.attributes).length > 0) {
        const filteredElements: ElementHandle<Element>[] = [];
        for (const element of elements) {
          let matchesAllAttributes = true;
          
          for (const [attrName, attrValue] of Object.entries(options.attributes)) {
            const actualValue = await page.evaluate(
              (el, attr) => el.getAttribute(attr),
              element, attrName
            );
            
            if (actualValue !== attrValue) {
              matchesAllAttributes = false;
              break;
            }
          }
          
          if (matchesAllAttributes) {
            filteredElements.push(element);
          }
        }
        elements = filteredElements;
      }
      
      // Filter by visibility if required
      if (mustBeVisible) {
        const filteredElements: ElementHandle<Element>[] = [];
        for (const element of elements) {
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   el.offsetWidth > 0 &&
                   el.offsetHeight > 0;
          }, element);
          
          if (isVisible) {
            filteredElements.push(element);
          }
        }
        elements = filteredElements;
      }
      
      // Get element by index if multiple matches
      if (elements.length > index) {
        return elements[index];
      }
    } catch (error) {
      // Continue trying until timeout
    }
    
    // Sleep a short time before retrying
    await page.waitForTimeout(100);
  }
  
  // If we get here, we didn't find the element within the timeout
  return null;
}

// Advanced wait for element function
async function waitForElement(page: Page, options: {
  selector: string,
  isXPath?: boolean,
  waitFor?: 'visible' | 'hidden' | 'present' | 'stable',
  text?: string,
  timeout?: number,
  pollInterval?: number
}): Promise<ElementHandle<Element> | null> {
  const waitFor = options.waitFor || 'visible';
  const timeout = options.timeout || 30000;
  const pollInterval = options.pollInterval || 100;
  const startTime = Date.now();
  
  let lastRect: { x: number, y: number, width: number, height: number } | null = null;
  let stableCount = 0;
  
  while (Date.now() - startTime < timeout) {
    try {
      // Find the element using XPath or CSS
      let elements: ElementHandle<Element>[] = [];
      
      if (options.isXPath) {
        elements = await page.$x(options.selector);
      } else {
        elements = await page.$$(options.selector);
      }
      
      // If waiting for element to be hidden
      if (waitFor === 'hidden') {
        if (elements.length === 0) {
          return null; // Success - element is hidden
        }
        
        // If there are elements, check if they are visible
        let allHidden = true;
        for (const element of elements) {
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   el.offsetWidth > 0 && 
                   el.offsetHeight > 0;
          }, element);
          
          if (isVisible) {
            allHidden = false;
            break;
          }
        }
        
        if (allHidden) {
          return null; // Success - all elements are hidden
        }
      } 
      // If waiting for element to be present (regardless of visibility)
      else if (waitFor === 'present') {
        if (elements.length > 0) {
          // Filter by text if specified
          if (options.text) {
            for (const element of elements) {
              const textContent = await page.evaluate(el => el.textContent, element);
              if (textContent && textContent.includes(options.text)) {
                return element; // Success - element is present with matching text
              }
            }
          } else {
            return elements[0]; // Success - element is present
          }
        }
      }
      // If waiting for element to be stable (not moving)
      else if (waitFor === 'stable') {
        if (elements.length > 0) {
          const element = elements[0];
          
          // Check if element has text content matching the requirement
          if (options.text) {
            const textContent = await page.evaluate(el => el.textContent, element);
            if (!textContent || !textContent.includes(options.text)) {
              stableCount = 0; // Reset counter if text doesn't match
              continue;
            }
          }
          
          // Get bounding box
          const boundingBox = await element.boundingBox();
          
          if (boundingBox) {
            const currentRect = {
              x: boundingBox.x,
              y: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height
            };
            
            if (lastRect) {
              // Check if position changed
              const positionChanged = 
                Math.abs(currentRect.x - lastRect.x) > 1 ||
                Math.abs(currentRect.y - lastRect.y) > 1 ||
                Math.abs(currentRect.width - lastRect.width) > 1 ||
                Math.abs(currentRect.height - lastRect.height) > 1;
              
              if (positionChanged) {
                stableCount = 0; // Reset counter
              } else {
                stableCount++;
                
                // Element is considered stable after 5 consecutive stable checks
                if (stableCount >= 5) {
                  return element;
                }
              }
            }
            
            lastRect = currentRect;
          }
        }
      }
      // Default: wait for element to be visible
      else { // waitFor === 'visible'
        for (const element of elements) {
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   el.offsetWidth > 0 && 
                   el.offsetHeight > 0;
          }, element);
          
          if (isVisible) {
            // Check if element has text content matching the requirement
            if (options.text) {
              const textContent = await page.evaluate(el => el.textContent, element);
              if (textContent && textContent.includes(options.text)) {
                return element; // Success - element is visible with matching text
              }
            } else {
              return element; // Success - element is visible
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors and continue waiting
    }
    
    // Wait before checking again
    await page.waitForTimeout(pollInterval);
  }
  
  // If we reach here, we've timed out
  return null;
}

// Wait for network to become idle
async function waitForNetworkIdle(page: Page, options: {
  timeout?: number,
  idleTime?: number,
  maxInflightRequests?: number
}): Promise<boolean> {
  const timeout = options.timeout || 30000;
  const idleTime = options.idleTime || 500;
  const maxInflightRequests = options.maxInflightRequests ?? 0;
  
  let inflightRequests = 0;
  let lastRequestTime = Date.now();
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const requestStartedListener = () => {
      inflightRequests++;
      lastRequestTime = Date.now();
    };
    
    const requestFinishedListener = () => {
      inflightRequests--;
      lastRequestTime = Date.now();
    };
    
    // Setup request tracking
    page.on('request', requestStartedListener);
    page.on('requestfinished', requestFinishedListener);
    page.on('requestfailed', requestFinishedListener);
    
    // Check conditions periodically
    const interval = setInterval(() => {
      const now = Date.now();
      
      // Check if we've reached timeout
      if (now - startTime > timeout) {
        cleanup();
        resolve(false);
        return;
      }
      
      // Check if network has been idle
      if (inflightRequests <= maxInflightRequests && now - lastRequestTime >= idleTime) {
        cleanup();
        resolve(true);
        return;
      }
    }, 100);
    
    // Cleanup function to remove listeners
    function cleanup() {
      clearInterval(interval);
      page.removeListener('request', requestStartedListener);
      page.removeListener('requestfinished', requestFinishedListener);
      page.removeListener('requestfailed', requestFinishedListener);
    }
  });
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

// ====== TOOL HANDLERS ======

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
        await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
        
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
          let element;
          if (args.isXPath) {
            const elements = await page.$x(args.selector);
            element = elements.length > 0 ? elements[0] : null;
            elementDesc = `XPath: ${args.selector}`;
          } else {
            element = await page.$(args.selector);
            elementDesc = `CSS: ${args.selector}`;
          }
          
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
        const isXPath = args.isXPath === true;
        const forceVisible = args.forceVisible !== false; // Default to true
        const index = args.index ?? 0;
        
        let element;
        
        if (args.text) {
          // Use advanced element finder with text
          element = await findElement(page, {
            selector: args.selector,
            isXPath: isXPath,
            text: args.text,
            position: {
              index: index,
              visible: forceVisible
            },
            timeout: timeout
          });
          
          if (!element) {
            return {
              content: [{
                type: "text",
                text: `Element not found: ${args.selector} with text "${args.text}"`,
              }],
              isError: true,
            };
          }
        } else {
          // Simple selector-based find
          try {
            if (isXPath) {
              // Use XPath
              const elements = await page.$x(args.selector);
              if (elements.length > index) {
                element = elements[index];
              }
            } else {
              // Use CSS selector
              const elements = await page.$$(args.selector);
              if (elements.length > index) {
                element = elements[index];
              }
            }
            
            if (!element) {
              return {
                content: [{
                  type: "text",
                  text: `Element not found: ${args.selector} (index ${index})`,
                }],
                isError: true,
              };
            }
            
            // Check visibility if required
            if (forceVisible) {
              const isVisible = await page.evaluate(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && 
                      style.visibility !== 'hidden' && 
                      style.opacity !== '0' &&
                      el.offsetWidth > 0 &&
                      el.offsetHeight > 0;
              }, element);
              
              if (!isVisible) {
                return {
                  content: [{
                    type: "text",
                    text: `Element found but not visible: ${args.selector}`,
                  }],
                  isError: true,
                };
              }
            }
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `Error finding element ${args.selector}: ${(error as Error).message}`,
              }],
              isError: true,
            };
          }
        }
        
        // Add a small random delay before clicking
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
        
        // Prepare click options
        const button = args.button === 'right' ? 'right' : 
                      args.button === 'middle' ? 'middle' : 'left';
                      
        const clickOptions = {
          button,
          clickCount: args.clickOptions?.clickCount || 1,
          delay: args.clickOptions?.delay || Math.floor(Math.random() * 100) + 50
        };
        
        // Set up navigation promise if needed
        let navigationPromise;
        if (args.waitForNavigation) {
          navigationPromise = page.waitForNavigation({ 
            waitUntil: 'networkidle2', 
            timeout: 30000 
          });
        }
        
        // Do the click
        await element.click(clickOptions);
        
        // Wait for navigation if required
        if (navigationPromise) {
          await navigationPromise;
        }
        
        const describeElement = await page.evaluate(el => {
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className,
            text: el.textContent?.trim().substring(0, 50) + (el.textContent && el.textContent.length > 50 ? '...' : '')
          };
        }, element);
        
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
        const isXPath = args.isXPath === true;
        const clearFirst = args.clearFirst !== false; // Default to true
        const index = args.index ?? 0;
        
        let element;
        
        try {
          if (isXPath) {
            // Use XPath
            const elements = await page.$x(args.selector);
            if (elements.length > index) {
              element = elements[index];
            }
          } else {
            // Use CSS selector
            const elements = await page.$(args.selector);
            if (elements.length > index) {
              element = elements[index];
            }
          }
          
          if (!element) {
            return {
              content: [{
                type: "text",
                text: `Input element not found: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          // Check if the element is actually an input or textarea
          const isInputOrTextarea = await page.evaluate(el => {
            const tagName = el.tagName.toLowerCase();
            return tagName === 'input' || tagName === 'textarea' || el.isContentEditable;
          }, element);
          
          if (!isInputOrTextarea) {
            return {
              content: [{
                type: "text",
                text: `Element is not an input or textarea: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          // Type the text with human-like behavior
          await typeHumanLike(page, element, args.value, {
            delay: args.delay,
            clearFirst: clearFirst
          });
          
          // Press Enter if required
          if (args.submitAfter) {
            await page.keyboard.press('Enter');
            // Wait a bit after pressing Enter in case of form submission
            await page.waitForTimeout(1000);
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
        const isXPath = args.isXPath === true;
        const byText = args.byText === true;
        const index = args.index ?? 0;
        
        try {
          let selectElement;
          
          if (isXPath) {
            const elements = await page.$x(args.selector);
            if (elements.length > index) {
              selectElement = elements[index];
            }
          } else {
            const elements = await page.$(args.selector);
            if (elements.length > index) {
              selectElement = elements[index];
            }
          }
          
          if (!selectElement) {
            return {
              content: [{
                type: "text",
                text: `Select element not found: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          // Make sure it's actually a select element
          const isSelect = await page.evaluate(el => el.tagName.toLowerCase() === 'select', selectElement);
          
          if (!isSelect) {
            return {
              content: [{
                type: "text",
                text: `Element is not a select: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          if (byText) {
            // Select by visible text
            const optionFound = await page.evaluate((el, optionText) => {
              for (const option of Array.from(el.options)) {
                if (option.textContent?.trim() === optionText) {
                  el.value = option.value;
                  return option.value;
                }
              }
              return null;
            }, selectElement, args.value);
            
            if (!optionFound) {
              return {
                content: [{
                  type: "text",
                  text: `Option with text "${args.value}" not found in select`,
                }],
                isError: true,
              };
            }
            
            // Trigger change event
            await page.evaluate(el => {
              const event = new Event('change', { bubbles: true });
              el.dispatchEvent(event);
            }, selectElement);
            
            return {
              content: [{
                type: "text",
                text: `Selected option with text "${args.value}" in ${args.selector}`,
              }],
              isError: false,
            };
          } else {
            // Select by value
            await selectElement.select(args.value);
            
            return {
              content: [{
                type: "text",
                text: `Selected option with value "${args.value}" in ${args.selector}`,
              }],
              isError: false,
            };
          }
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
        const isXPath = args.isXPath === true;
        const index = args.index ?? 0;
        
        try {
          let element;
          
          if (isXPath) {
            const elements = await page.$x(args.selector);
            if (elements.length > index) {
              element = elements[index];
            }
          } else {
            const elements = await page.$(args.selector);
            if (elements.length > index) {
              element = elements[index];
            }
          }
          
          if (!element) {
            return {
              content: [{
                type: "text",
                text: `Element not found: ${args.selector}`,
              }],
              isError: true,
            };
          }
          
          // Add a small random delay before hovering
          await page.waitForTimeout(Math.floor(Math.random() * 200) + 50);
          
          // Move mouse to element
          const box = await element.boundingBox();
          if (box) {
            // Move to the center of the element with a random offset
            const x = box.x + box.width / 2 + (Math.random() * 6 - 3);
            const y = box.y + box.height / 2 + (Math.random() * 6 - 3);
            
            // Move mouse with realistic speed
            await page.mouse.move(x, y, { steps: 10 });
          } else {
            await element.hover();
          }
          
          const describeElement = await page.evaluate(el => {
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id,
              className: el.className,
              text: el.textContent?.trim().substring(0, 50) + (el.textContent && el.textContent.length > 50 ? '...' : '')
            };
          }, element);
          
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

      case "puppeteer_wait_for_element": {
        const element = await waitForElement(page, {
          selector: args.selector,
          isXPath: args.isXPath,
          waitFor: args.waitFor,
          text: args.text,
          timeout: args.timeout,
          pollInterval: args.pollInterval
        });
        
        if (!element && args.waitFor !== 'hidden') {
          return {
            content: [{
              type: "text",
              text: `Timeout waiting for element: ${args.selector}${args.text ? ` with text "${args.text}"` : ''}`,
            }],
            isError: true,
          };
        }
        
        if (args.waitFor === 'hidden') {
          return {
            content: [{
              type: "text",
              text: `Element is now hidden: ${args.selector}`,
            }],
            isError: false,
          };
        }
        
        const describeElement = element ? await page.evaluate(el => {
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className,
            text: el.textContent?.trim().substring(0, 50) + (el.textContent && el.textContent.length > 50 ? '...' : '')
          };
        }, element) : null;
        
        return {
          content: [{
            type: "text",
            text: `Element is now ${args.waitFor || 'visible'}: ${describeElement ? `${describeElement.tag}${describeElement.id ? '#'+describeElement.id : ''} with text "${describeElement.text}"` : args.selector}`,
          }],
          isError: false,
        };
      }

      case "puppeteer_wait_for_network_idle": {
        const success = await waitForNetworkIdle(page, {
          timeout: args.timeout,
          idleTime: args.idleTime,
          maxInflightRequests: args.maxInflightRequests
        });
        
        if (!success) {
          return {
            content: [{
              type: "text",
              text: `Timeout waiting for network to become idle`,
            }],
            isError: true,
          };
        }
        
        return {
          content: [{
            type: "text",
            text: `Network is now idle`,
          }],
          isError: false,
        };
      }

      case "puppeteer_find_element": {
        const element = await findElement(page, {
          selector: args.selector,
          isXPath: args.isXPath,
          text: args.text,
          textExact: args.textExact,
          tagName: args.tagName,
          attributes: args.attributes,
          position: args.position,
          timeout: args.timeout
        });
        
        if (!element) {
          return {
            content: [{
              type: "text",
              text: `Element not found with the specified criteria`,
            }],
            isError: true,
          };
        }
        
        const elementInfo = await page.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(el);
          
          // Helper function to get attribute safely
          const getAttr = (name: string) => el.hasAttribute(name) ? el.getAttribute(name) : null;
          
          return {
            tagName: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className,
            name: getAttr('name'),
            type: getAttr('type'),
            value: getAttr('value'),
            textContent: el.textContent?.trim().substring(0, 100) + (el.textContent && el.textContent.length > 100 ? '...' : ''),
            attributes: Array.from(el.attributes).map(attr => `${attr.name}="${attr.value}"`),
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            isVisible: computedStyle.display !== 'none' && 
                       computedStyle.visibility !== 'hidden' && 
                       computedStyle.opacity !== '0' &&
                       rect.width > 0 && 
                       rect.height > 0,
            css: {
              display: computedStyle.display,
              visibility: computedStyle.visibility,
              position: computedStyle.position,
              zIndex: computedStyle.zIndex
            }
          };
        }, element);
        
        let content: (TextContent | ImageContent)[] = [
          {
            type: "text",
            text: `Element found: ${elementInfo.tagName}${elementInfo.id ? '#'+elementInfo.id : ''}\n\nDetails:\n${JSON.stringify(elementInfo, null, 2)}`,
          } as TextContent
        ];
        
        // Take screenshot if requested
        if (args.takeScreenshot) {
          const screenshot = await element.screenshot({ encoding: "base64" });
          const screenshotName = args.screenshotName || `element-${Date.now()}`;
          
          screenshots.set(screenshotName, screenshot as string);
          server.notification({
            method: "notifications/resources/list_changed",
          });
          
          content.push({
            type: "image",
            data: screenshot as string,
            mimeType: "image/png",
          } as ImageContent);
        }
        
        return {
          content,
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
        
        // Convert string args to actual values
        const evaluateArgs = args.args ? args.args.map((arg: string) => {
          try {
            return JSON.parse(arg);
          } catch (e) {
            return arg;
          }
        }) : [];

        const result = await page.evaluate(
          new Function(
            ...evaluateArgs.map((_: any, i: number) => `arg${i}`),
            `return (async () => { ${args.script} })();`
          ),
          ...evaluateArgs
        );

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
