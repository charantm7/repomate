from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Union
from fastapi.templating import Jinja2Templates

app = FastAPI()
template = Jinja2Templates(directory='templates')


class Item(BaseModel):
    name:str
    price:int
    is_available: Union[bool, None] = None

{
    "name": "Foo",
    "description": "An optional description",
    "price": 45,
    "tax": 3.5
}

@app.post('/items/')
async def item(item:Item):
    return item


@app.get("/", response_class=HTMLResponse)
def html_page(request: Request, name:str):

    context = {
        "request": request,
        "name": name
    }
    return template.TemplateResponse("index.html",context)
    
    
    
