"""Generate the tiny dev-only ONNX model served by the compose `embeddings`
profile (SA4E-335 DEF-003). Identity graph, no external assets, checked by
onnx.checker before writing. Run: python generate-identity-model.py"""
import onnx
from onnx import helper, TensorProto

inp = helper.make_tensor_value_info("X", TensorProto.FLOAT, [1, 4])
out = helper.make_tensor_value_info("Y", TensorProto.FLOAT, [1, 4])
graph = helper.make_graph([helper.make_node("Identity", ["X"], ["Y"])], "identity", [inp], [out])
model = helper.make_model(graph, producer_name="sa4e-335-dev-fixture")
# Keep IR/opset old enough for the mcr onnxruntime/server image (ORT 1.x).
model.ir_version = 3
model.opset_import[0].version = 9
onnx.checker.check_model(model)
onnx.save(model, "identity.onnx")
print("wrote identity.onnx")
