import streamlit as st
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from langchain.text_splitter import CharacterTextSplitter
from langchain_community.embeddings import HuggingFaceBgeEmbeddings
from langchain_community.vectorstores import FAISS
from sentence_transformers import SentenceTransformer, util
from langchain_community.chat_models import  ChatOpenAI
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationalRetrievalChain
from langchain_community.document_loaders import DirectoryLoader
from langchain_community.document_loaders.text import TextLoader
from langchain_core.documents import Document
import os, zipfile
from io import BytesIO
import chardet

def get_raw_directory_text(pdf_docs):
    text = ""
    pdf_reader = PdfReader(pdf_docs)
    for page in pdf_reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"

    return text

def get_text_chunks(documents):
    text_splitter = CharacterTextSplitter(
        separator="\n",
        chunk_size = 1000,
        chunk_overlap = 200,
        length_function=len
    )
   
    chunk = text_splitter.split_text(documents)

    return chunk

def get_vector_store(chunks):

    embeddings = HuggingFaceBgeEmbeddings(model_name="BAAI/bge-small-en-v1.5")
    
    vectorstore = FAISS.from_texts(texts=chunks, embedding=embeddings)
    return vectorstore

def get_conversation(vector_store):

    llm =  ChatOpenAI(model= "mistralai/mistral-small-3.2-24b-instruct:free",
                      base_url="https://openrouter.ai/api/v1",api_key=os.getenv("OPENROUTER_API_KEY"))
    memory = ConversationBufferMemory(memory_key='chat_history', return_messages=True)
    conversation = ConversationalRetrievalChain.from_llm(
        llm = llm,
        retriever = vector_store.as_retriever(),
        memory = memory 
    )
    return conversation

def read_file_safely(file_path):
    try:
        with open(file_path, "rb") as f:
            raw = f.read()
            encoding = chardet.detect(raw)["encoding"]
            return raw.decode(encoding or 'utf-8', errors='ignore')
    except Exception as e:
        return f"[Error reading {file_path}]: {str(e)}"

def file_traversal(extract_path):
    directory_docs = []
    for root, dirs, files in os.walk(extract_path):
        for file in files:
            filepath = os.path.join(root, file)

            if not file.lower().endswith((".py", ".txt", ".md", ".json", ".html", ".css", ".scss" ".js", ".jsx",".xml", ".csv", ".yml", ".ini")):
                continue

            # get the file text
            content = read_file_safely(filepath)
            directory_docs.append(Document(page_content=content, metadata={'source':filepath}))

    return directory_docs


css = """
<style>
        .user{
            display: flex;
            flex-direction: column;
            align-items: end;
            padding: .4rem 1rem;
            gap: 10px;
            border-radius: 10px;
            background-color: rgba(255, 255, 255, 0.034);
        
        }

        .user .top{
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-end;
            gap: 1rem;
        }

        .user .top p{
            margin-top: 10px;
            font-size: 20px;
        }

        img{
            height: 40px;
            width: 40px;
            background-position: center;
            background-size: cover;
            border-radius: 50%;
            object-fit: cover;
        }

        .user .bottom{
            display: flex;
            align-items: center;
            justify-content: flex-end;
            /* padding: 1rem; */
            line-height: 1.5;

        }

        .bot{
            display: flex;
            flex-direction: column;
            
            align-items: start;
            justify-content: space-evenly;
            padding: .4rem 1rem;
            margin-top:10px;
            gap: 10px;
            background-color: rgba(149, 149, 149, 0.231);
            border-radius: 10px;
        }
        .bot .top{
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }
        .bot .top p{
            margin-top: 10px;
            font-size: 20px;
        }
        .bot .bottom{
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-end;
            /* padding: 1rem; */
            line-height: 1.5;

        }
</style>
"""

user_templapalte = """

<div class="user">
    <div class="top">
        <p>Me</p>
        <img src="https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png" alt="avatar">
    </div>
    <div class="bottom">
        <p>{{question}}</p>
    </div>
</div>

"""

bot_template = """

<div class="bot">
    <div class="top">
        <img src="https://www.shutterstock.com/image-vector/chat-bot-icon-virtual-smart-600nw-2478937555.jpg" alt="">
        <p>Bots</p>    
    </div>
    <div class="bottom">
        <p>{{response}}</p>
    </div>
</div>

"""

def question_handle(question):
    response = st.session_state.conversation({'question':question})
    st.session_state.chat_history = response['chat_history']

    for i, message in enumerate(st.session_state.chat_history):
        if i%2 == 0:
            st.markdown(user_templapalte.replace("{{question}}", message.content), unsafe_allow_html=True)
        else:
            st.markdown(bot_template.replace("{{response}}", message.content), unsafe_allow_html=True)


def main():
    load_dotenv()
    st.set_page_config(page_title="PDF Analyser", page_icon=":books:")
    st.markdown(css, unsafe_allow_html=True)

    st.header("Chat with the multiple PDF's :books:")
    question = st.text_input("Ask questions about pdf :")

    if question:
        question_handle(question)


    if "conversation" not in st.session_state:
        st.session_state.conversation = None

    if "chat_history" not in st.session_state:
        st.session_state.chat_history = None


    with st.sidebar:
        st.subheader("My Docs")
        pdf_ziped_doc = st.file_uploader("Upload your Project ZIP file and click 'Process'")

        if st.button("Process"):
            with st.spinner():

                # set extraction path
                if pdf_ziped_doc is not None and pdf_ziped_doc.type == 'application/zip':

                    extract_path = "/home/charantm/Devkernal/repomate/extraction"

                    # clear all last extraction
                    if os.path.exists(extract_path):
                        import shutil
                        shutil.rmtree(extract_path)

                    # extract all the files in zip
                    with zipfile.ZipFile(pdf_ziped_doc, "r") as zip_re:
                        zip_re.extractall(extract_path)
                        st.success("File extraction successfull")

                        all_docs = file_traversal(extract_path)

                elif pdf_ziped_doc is not None and pdf_ziped_doc.type == 'application/pdf':

                    all_docs = get_raw_directory_text(pdf_ziped_doc)

                # get the chunk data
                chunks = get_text_chunks(all_docs)
                st.success("Chunked the doc!")

                # store in a vector database
                vector_store = get_vector_store(chunks)
                st.success("Ready for conversation")
                st.session_state.conversation = get_conversation(vector_store)
                


if __name__ == "__main__":
    main()