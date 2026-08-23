<?
foreach($ignored as $m)
{
	echo '<div style="margin-top: 5px">';
	
	echo '<div style="display:inline; margin-right: 5px">';
	echo $html->link($m, '/miners/profile/'.$m);
	echo '</div>';
	
	echo $form->create(NULL, array('action' => 'list_miners', 'style' => 'display:inline'));
	echo $form->input('ChatUnignore.name', array('type' => 'hidden', 'value' => $m, 'div' => false));
	echo $form->end(array('label' => 'Unignore', 'div' => false));
		
	echo "</div>";
}
?>