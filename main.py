from enum import Enum
from typing import Union
from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from git import Repo
import os


class ModelName(str, Enum):
    alexnet = "alexnet"
    resnet = "resnet"
    lenet = "lenet"

class Student(BaseModel):
    name:str
    age:int | None = None
    sem:str
    course:str
    college:str


app = FastAPI()
template = Jinja2Templates(directory='templates')


@app.get("/models/{name}")
async def get_model(name: ModelName):
    if name is ModelName.alexnet.value == 'alexnet':
        return {"name": name, "message": "Deep Learning FTW!"}

    elif name is ModelName.lenet:
        return {"name": name, "message": "LeCNN all the images"}
    else:
        return {"name": name, "message": "Have some residuals"}
    
@app.get("/price/{item_id}")
async def price(item_id:int, price:int, quantity:int=0, available: Union[bool, None] = None):

    item = {
        "Item ID":item_id,
        "Price":price,
        "Quantity":quantity,
        "Item Available":available
    }
    return item

@app.put("/student/{item_id}")
async def create_student(item_id:int, student:Student, passed:Union[bool, None] = None):
    result = {"item_id":item_id, **student.dict()}
    if passed is True:
        result.update({"Result": f"{student.name} has passed in {student.sem} sem"})

    else:
        result.update({"Result": f"{student.name} has Failed in {student.sem} Sem"})


    return result

def clone_repo(git_url, directory):
    Repo.clone_from(git_url, directory)

@app.get("/", response_class=HTMLResponse)
async def git(request:Request, git_url:str = "", directory:str = ""):
    
    if git_url and directory is not None:
        try:
            if not os.path.exists(directory):
                clone_repo(git_url=git_url, directory=directory)
                msg = f"Cloned {git_url} to {directory}"
                RedirectResponse(url='/', status_code=302)

            else:
                msg = f"Directory {directory} already exists!"

        except Exception as e:
            msg = f"Error {e}"

    else:
        msg = ''
    return template.TemplateResponse("index.html", {"request":request, "msg":msg, "git_url": git_url,
        "directory": directory,}, )