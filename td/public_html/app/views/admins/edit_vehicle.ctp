<?

echo $form->create('Vehicle', array('url' => 'edit_vehicle'));
echo $form->input('id', array('type' => 'hidden'));
echo $form->input('item_id', array('type' => 'hidden'));
echo $form->input('speed');
echo $form->input('capacity');

if (isset($this->data['Land']['id']))
{
	echo $form->input('Land.id', array('type' => 'hidden'));
	echo $form->input('Land.attack');
	echo $form->input('Land.armor');
}
if (isset($this->data['Ship']['id']))
{
	echo $form->input('Ship.id', array('type' => 'hidden'));
	echo $form->input('Ship.cannon_portals');
	echo $form->input('Ship.hull');
	echo $form->input('Ship.crew');
}
if (isset($this->data['Aircraft']['id']))
{
	echo $form->input('Aircraft.id', array('type' => 'hidden'));
	echo $form->input('Aircraft.type');
}

echo $form->end('Save Vehicle');
pr($this->data);

?>